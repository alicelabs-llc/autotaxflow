import type { FastifyInstance } from 'fastify';
import { prisma, ProviderName, ConnectionStatus } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { encryptToken } from '../../lib/crypto';
import { writeAudit, AuditAction } from '../../lib/audit';

/**
 * QBO OAuth flow:
 *   1. User clicks "Connect QuickBooks" in web app
 *   2. Browser → GET /api/integrations/qbo/connect?orgId=...
 *      → redirect to Intuit OAuth authorize URL with orgId in state
 *   3. User authorizes on Intuit
 *   4. Intuit → GET /api/integrations/qbo/callback?code=...&state=...&realmId=...
 *      → exchange code for tokens, persist in OAuthToken (AES-256-GCM encrypted)
 *      → create/update ConnectedAccount(externalAccountId=realmId)
 *      → redirect back to web app
 *
 * The Intuit OAuth endpoints:
 *   Authorize:  https://appcenter.intuit.com/connect/oauth2
 *   Token:      https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 *
 * Scopes needed:
 *   - com.intuit.quickbooks.accounting
 */
export async function qboIntegrationRoutes(fastify: FastifyInstance) {
  fastify.get('/connect', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { orgId } = request.query as { orgId?: string };
      const { sub: userId } = request.user;
      if (!orgId) return reply.status(400).send({ error: 'orgId query param required' });

      // Verify membership
      const membership = await prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return reply.status(403).send({ error: 'OWNER/ADMIN only' });
      }

      if (!env.QBO_CLIENT_ID) {
        return reply.status(500).send({ error: 'QBO_CLIENT_ID not configured' });
      }

      const state = Buffer.from(JSON.stringify({ orgId, userId })).toString('base64url');
      const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
      authUrl.searchParams.set('client_id', env.QBO_CLIENT_ID);
      authUrl.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
      authUrl.searchParams.set('redirect_uri', env.QBO_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);

      return reply.redirect(authUrl.toString());
    },
  });

  fastify.get('/callback', async (request, reply) => {
    const { code, state, realmId, error } = request.query as {
      code?: string;
      state?: string;
      realmId?: string;
      error?: string;
    };

    if (error) {
      return reply.redirect(`${env.WEB_ORIGIN}/dashboard?integration=qbo&error=${encodeURIComponent(error)}`);
    }
    if (!code || !state || !realmId) {
      return reply.status(400).send({ error: 'Missing required OAuth params' });
    }

    // Decode state
    let ctx: { orgId: string; userId: string };
    try {
      ctx = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return reply.status(400).send({ error: 'Invalid state' });
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.QBO_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      fastify.log.error({ err }, 'QBO token exchange failed');
      return reply.redirect(
        `${env.WEB_ORIGIN}/dashboard?integration=qbo&error=${encodeURIComponent('Token exchange failed')}`
      );
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      refresh_token_expires_in?: number;
      scope?: string;
    };

    // Persist ConnectedAccount (upsert by [orgId, QUICKBOOKS, realmId])
    const connectedAccount = await prisma.connectedAccount.upsert({
      where: {
        organizationId_provider_externalAccountId: {
          organizationId: ctx.orgId,
          provider: ProviderName.QUICKBOOKS,
          externalAccountId: realmId,
        },
      },
      create: {
        organizationId: ctx.orgId,
        provider: ProviderName.QUICKBOOKS,
        externalAccountId: realmId,
        status: ConnectionStatus.CONNECTED,
      },
      update: {
        status: ConnectionStatus.CONNECTED,
        lastSyncAt: new Date(),
      },
    });

    // Persist OAuth tokens (encrypted)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await prisma.oAuthToken.upsert({
      where: { connectedAccountId: connectedAccount.id },
      create: {
        connectedAccountId: connectedAccount.id,
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt,
        scope: tokens.scope,
      },
      update: {
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt,
        scope: tokens.scope,
      },
    });

    await writeAudit({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: AuditAction.CONNECTED_ACCOUNT_LINKED,
      entity: 'ConnectedAccount',
      entityId: connectedAccount.id,
      details: { provider: 'QUICKBOOKS', realmId },
    });

    // Enqueue initial sync
    const { syncQueue } = await import('../../lib/bullmq');
    await syncQueue.add('sync.qbo.accounts', { connectedAccountId: connectedAccount.id });
    await syncQueue.add('sync.qbo.transactions', { connectedAccountId: connectedAccount.id });

    return reply.redirect(`${env.WEB_ORIGIN}/dashboard?integration=qbo&status=connected`);
  });

  fastify.post('/disconnect', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const orgId = request.currentOrgId!;
      const { realmId } = request.body as { realmId: string };
      const account = await prisma.connectedAccount.findUnique({
        where: {
          organizationId_provider_externalAccountId: {
            organizationId: orgId,
            provider: ProviderName.QUICKBOOKS,
            externalAccountId: realmId,
          },
        },
        include: { oauthTokens: true },
      });
      if (!account) return reply.status(404).send({ error: 'Not connected' });

      // Revoke token (best-effort)
      if (account.oauthTokens) {
        try {
          await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`).toString('base64')}`,
            },
            body: new URLSearchParams({ token: account.oauthTokens.accessTokenEncrypted }),
          });
        } catch (err) {
          fastify.log.warn({ err: (err as Error).message }, 'QBO token revoke failed');
        }
      }

      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { status: ConnectionStatus.DISCONNECTED },
      });

      return reply.send({ status: 'disconnected' });
    },
  });
}
