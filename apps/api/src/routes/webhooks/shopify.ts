import type { FastifyPluginAsync } from 'fastify';
import { prisma, ProviderName, TransactionType, WebhookStatus } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { ingestQueue } from '../../lib/bullmq';
import crypto from 'crypto';

/**
 * Shopify webhook gateway. Same pattern as Stripe:
 *   1. Verify HMAC signature with SHOPIFY_API_SECRET.
 *   2. Persist WebhookEvent with provider=SHOPIFY before enqueuing.
 *   3. Enqueue ingest job with just the webhookId.
 *   4. Worker (processShopifyIngest) loads + dispatches by topic.
 *
 * The HMAC is computed over the raw body (without the leading X-Shopify-Topic
 * header). HMAC is hex digest.
 *
 * Shopify orders X-Shopify-Topic header to dispatch: orders/create, refunds/create,
 * etc. The eventId is the X-Shopify-Webhook-Id header (globally unique per delivery).
 */
export const shopifyWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/', async (request, reply) => {
    const hmac = request.headers['x-shopify-hmac-sha256'] as string | undefined;
    const topic = request.headers['x-shopify-topic'] as string | undefined;
    const eventId = request.headers['x-shopify-webhook-id'] as string | undefined;
    const shopDomain = request.headers['x-shopify-shop-domain'] as string | undefined;
    const apiVersion = request.headers['x-shopify-api-version'] as string | undefined;

    if (!hmac || !topic || !eventId) {
      return reply.status(400).send({ error: 'Missing Shopify headers' });
    }

    // Verify HMAC
    const secret = env.SHOPIFY_API_SECRET;
    if (!secret) {
      return reply.status(500).send({ error: 'SHOPIFY_API_SECRET not set' });
    }

    const rawBody = request.body as Buffer;
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    if (computed !== hmac) {
      fastify.log.warn({ eventId, topic }, 'Shopify webhook HMAC verification failed');
      return reply.status(401).send({ error: 'Invalid HMAC' });
    }

    // Parse JSON for payload storage
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON' });
    }

    // Idempotency — upsert WebhookEvent. provider_eventId unique.
    let webhook;
    try {
      webhook = await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: ProviderName.SHOPIFY, eventId } },
        create: {
          provider: ProviderName.SHOPIFY,
          eventId,
          payload: payload as object,
          status: WebhookStatus.PENDING,
        },
        update: {},
        select: { id: true, status: true },
      });
    } catch (err) {
      fastify.log.error({ err: (err as Error).message, eventId }, 'Shopify webhook DB write failed');
      return reply.status(500).send({ error: 'Failed to persist webhook' });
    }

    if (webhook.status === WebhookStatus.PROCESSED) {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    await ingestQueue.add(
      'shopify.ingestEvent',
      { webhookId: webhook.id, topic, shopDomain, apiVersion },
      { jobId: webhook.id }
    );

    return reply.status(200).send({ received: true });
  });
};
