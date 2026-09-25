import type { FastifyPluginAsync } from 'fastify';
import { prisma, ProviderName, WebhookStatus } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { ingestQueue } from '../../lib/bullmq';
import crypto from 'crypto';

/**
 * WooCommerce webhook gateway.
 *
 * WooCommerce sends HMAC-SHA256 in `x-wc-webhook-signature` header (base64).
 * Computed over the raw body with the webhook's secret (stored per-webhook in WP).
 *
 * For multi-tenant: we use the `x-wc-webhook-source` header (shop URL) to
 * resolve the ConnectedAccount(externalAccountId=shop_url).
 *
 * Topics WooCommerce sends: order.created, order.updated, order.deleted,
 * refund.created, etc. We map them to handlers similar to Shopify.
 */
export const woocommerceWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/', async (request, reply) => {
    const sigBase64 = request.headers['x-wc-webhook-signature'] as string | undefined;
    const topic = request.headers['x-wc-webhook-topic'] as string | undefined;
    const source = request.headers['x-wc-webhook-source'] as string | undefined; // shop URL
    const webhookId = request.headers['x-wc-webhook-id'] as string | undefined;

    if (!sigBase64 || !topic || !webhookId) {
      return reply.status(400).send({ error: 'Missing WooCommerce webhook headers' });
    }

    // The webhook secret is per-webhook. For multi-tenant we keep one
    // global WOOCOMMERCE_API_SECRET per env (single instance MVP). For true
    // multi-tenant we'd need a lookup per source URL.
    const secret = env.WOOCOMMERCE_API_SECRET;
    if (!secret) {
      return reply.status(500).send({ error: 'WOOCOMMERCE_API_SECRET not set' });
    }

    const rawBody = request.body as Buffer;
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    // Timing-safe comparison
    const sigBuf = Buffer.from(sigBase64, 'base64');
    const compBuf = Buffer.from(computed, 'base64');
    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      fastify.log.warn({ webhookId, topic }, 'WooCommerce HMAC verification failed');
      return reply.status(401).send({ error: 'Invalid HMAC' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON' });
    }

    // Lookup tenant via shop URL (source header)
    let organizationId: string | null = null;
    if (source) {
      const account = await prisma.connectedAccount.findFirst({
        where: { provider: ProviderName.WOOCOMMERCE, externalAccountId: source },
        select: { organizationId: true },
      });
      organizationId = account?.organizationId || null;
    }

    // Persist WebhookEvent
    let webhook;
    try {
      webhook = await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: ProviderName.WOOCOMMERCE, eventId: webhookId } },
        create: {
          provider: ProviderName.WOOCOMMERCE,
          eventId: webhookId,
          payload: { ...(payload as object), _source: source, _topic: topic } as object,
          status: WebhookStatus.PENDING,
        },
        update: {},
        select: { id: true, status: true },
      });
    } catch (err) {
      fastify.log.error({ err: (err as Error).message }, 'WooCommerce DB write failed');
      return reply.status(500).send({ error: 'DB write failed' });
    }

    if (webhook.status === WebhookStatus.PROCESSED) {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // Enqueue ingest
    await ingestQueue.add(
      'woocommerce.ingestEvent',
      { webhookId: webhook.id, topic, shopDomain: source, organizationId },
      { jobId: webhook.id }
    );

    return reply.status(200).send({ received: true });
  });
};
