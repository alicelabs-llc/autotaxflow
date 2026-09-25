import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@autotaxflow/db';
import { env } from '../../lib/env';

/**
 * SSO routes — generic OIDC.
 *
 * Flow:
 *   1. User clicks "Sign in with SSO" in web app
 *   2. Browser → GET /api/auth/sso/login?returnTo=/dashboard
 *      → redirect to OIDC provider authorize URL with state in cookie
 *   3. User authenticates at provider (Google/Microsoft/Okta)
 *   4. Provider → GET /api/auth/sso/callback?code=...&state=...
 *      → exchange code for tokens, fetch user info
 *      → find/create User in DB by email
 *      → issue AutoTaxFlow JWT
 *      → redirect to returnTo with token in URL hash
 *
 * Configurable via env:
 *   OIDC_ISSUER        — e.g. https://accounts.google.com
 *   OIDC_CLIENT_ID
 *   OIDC_CLIENT_SECRET
 *
 * For Google Workspace: OIDC_ISSUER=https://accounts.google.com
 * For Microsoft Entra:   OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
 * For Okta:              OIDC_ISSUER=https://<tenant>.okta.com
 */

const StateCookie = 'autotaxflow_sso_state';

export const ssoRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/login', async (request, reply) => {
    if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) {
      return reply.status(503).send({ error: 'SSO not configured' });
    }
    const returnTo = (request.query as { returnTo?: string }).returnTo || '/dashboard';
    const state = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const nonce = Math.random().toString(36).slice(2);

    reply.setCookie(
      StateCookie,
      JSON.stringify({ state, returnTo, nonce }),
      {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 600, // 10 minutes
      }
    );

    const callbackUrl = `${env.WEB_ORIGIN.replace('localhost:3000', 'localhost:3001')}/api/auth/sso/callback`;
    const authUrl = new URL(`${env.OIDC_ISSUER}/authorize`);
    authUrl.searchParams.set('client_id', env.OIDC_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    return reply.redirect(authUrl.toString());
  });

  fastify.get('/callback', async (request, reply) => {
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    if (error) {
      return reply.redirect(`${env.WEB_ORIGIN}/login?sso_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state' });
    }

    const stateCookie = request.cookies[StateCookie];
    if (!stateCookie) {
      return reply.status(400).send({ error: 'Missing state cookie' });
    }
    let cookieState: { state: string; returnTo: string; nonce: string };
    try {
      cookieState = JSON.parse(stateCookie);
    } catch {
      return reply.status(400).send({ error: 'Invalid state cookie' });
    }
    if (cookieState.state !== state) {
      return reply.status(400).send({ error: 'State mismatch' });
    }
    reply.clearCookie(StateCookie);

    const callbackUrl = `${env.WEB_ORIGIN.replace('localhost:3000', 'localhost:3001')}/api/auth/sso/callback`;
    const tokenEndpoint = `${env.OIDC_ISSUER}/token`;
    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: env.OIDC_CLIENT_ID,
        client_secret: env.OIDC_CLIENT_SECRET,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      fastify.log.error({ err: await tokenRes.text() }, 'OIDC token exchange failed');
      return reply.status(502).send({ error: 'Token exchange failed' });
    }

    const tokens = (await tokenRes.json()) as { access_token: string; id_token: string };

    const userRes = await fetch(`${env.OIDC_ISSUER}/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      return reply.status(502).send({ error: 'Failed to fetch user info' });
    }
    const userinfo = (await userRes.json()) as { email: string; name?: string; sub: string };

    const user = await prisma.user.upsert({
      where: { email: userinfo.email },
      create: { email: userinfo.email, name: userinfo.name || null },
      update: { name: userinfo.name || undefined },
      select: { id: true, email: true, name: true },
    });

    const jwt = fastify.signToken({ sub: user.id, email: user.email });
    const returnTo = cookieState.returnTo || '/dashboard';
    return reply.redirect(`${env.WEB_ORIGIN}${returnTo}#sso_token=${jwt}`);
  });

  fastify.get('/config', async (_request, reply) => {
    return reply.send({
      enabled: Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID),
      issuer: env.OIDC_ISSUER,
      provider: env.OIDC_ISSUER?.includes('google')
        ? 'google'
        : env.OIDC_ISSUER?.includes('microsoft')
        ? 'microsoft'
        : env.OIDC_ISSUER?.includes('okta')
        ? 'okta'
        : 'generic',
    });
  });
};
