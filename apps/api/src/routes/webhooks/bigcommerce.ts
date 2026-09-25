import type { FastifyPluginAsync } from 'fastify';
import { prisma, ProviderName, WebhookStatus } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { ingestQueue } from '../../lib/bullmq';
import crypto from 'crypto';

/**
 * BigCommerce webhook gateway.
 *
 * BigCommerce signs webhooks with HMAC-SHA256 in the `x-bc-hash-sha256` header
 * (hex digest) using the per-app Client Secret. BigCommerce also sends:
 *   - x-bc-webhook-action (the event action, e.g. "order.created")
 *   - x-bc-store-hash (identifies the BC store)
 *
 * Multi-tenant lookup: ConnectedAccount(externalAccountId=store_hash).
 */
export const bigcommerceWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/', async (request, reply) => {
    const sigHex = request.headers['x-bc-hash-sha256'] as string | undefined;
    const action = request.headers['x-bc-webhook-action'] as string | undefined;
    const storeHash = request.headers['x-bc-store-hash'] as string | undefined;
    const webhookId = request.headers['x-bc-webhook-id'] as string | undefined;

    if (!sigHex || !action || !webhookId) {
      return reply.status(400).send({ error: 'Missing BigCommerce webhook headers' });
    }

    const secret = env.BIGCOMMERCE_CLIENT_SECRET;
    if (!secret) {
      return reply.status(500).send({ error: 'BIGCOMMERCE_CLIENT_SECRET not set' });
    }

    const rawBody = request.body as Buffer;
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(sigHex, 'hex');
    const compBuf = Buffer.from(computed, 'hex');
    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      fastify.log.warn({ webhookId, action }, 'BigCommerce HMAC verification failed');
      return reply.status(401).send({ error: 'Invalid HMAC' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON' });
    }

    let organizationId: string | null = null;
    if (storeHash) {
      const account = await prisma.connectedAccount.findFirst({
        where: { provider: ProviderName.BIGCOMMERCE, externalAccountId: storeHash },
        select: { organizationId: true },
      });
      organizationId = account?.organizationId || null;
    }

    let webhook;
    try {
      webhook = await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: ProviderName.BIGCOMMERCE, eventId: webhookId } },
        create: {
          provider: ProviderName.BIGCOMMERCE,
          eventId: webhookId,
          payload: { ...(payload as object), _storeHash: storeHash, _action: action } as object,
          status: WebhookStatus.PENDING,
        },
        update: {},
        select: { id: true, status: true },
      });
    } catch (err) {
      fastify.log.error({ err: (err as Error).message }, 'BigCommerce DB write failed');
      return reply.status(500).send({ error: 'DB write failed' });
    }

    if (webhook.status === WebhookStatus.PROCESSED) {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    await ingestQueue.add(
      'bigcommerce.ingestEvent',
      { webhookId: webhook.id, action, storeHash, organizationId },
      { jobId: webhook.id }
    );

    return reply.status(200).send({ received: true });
  });
};
