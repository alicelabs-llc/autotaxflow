import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '@autotaxflow/db';
import { ingestQueue } from '../../lib/bullmq';
import { env } from '../../lib/env';

// Cliente Stripe singleton. Constructed eagerly; calls fail fast on bad key.
const stripe = new Stripe(env.STRIPE_SECRET_KEY || undefined!, {
  // Sin apiVersion: el SDK usa la última versión default del paquete.
});

/**
 * Webhook de Stripe.
 *
 * - Captura el body RAW (necesario para verificar la firma HMAC) usando
 *   addContentTypeParser sobre 'application/json'.
 * - Verifica signature con stripe.webhooks.constructEvent().
 * - Persiste el WebhookEvent en DB ANTES de encolar en BullMQ.
 *   Si Redis cae, el evento sigue en DB y un worker tick puede reprocesarlo.
 *   El job en BullMQ solo lleva webhookId — nunca el payload completo.
 * - Responde 200 a Stripe en <200ms.
 */
export const stripeWebhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Raw body para verificación de firma. No consume nada, solo captura el buffer.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  fastify.post('/', async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string | undefined;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return reply
        .status(400)
        .send({ error: 'Missing stripe-signature header or STRIPE_WEBHOOK_SECRET' });
    }

    let event: Stripe.Event;
    try {
      const rawBody = request.body as Buffer;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      const msg = (err as Error).message;
      fastify.log.warn({ msg }, 'Stripe webhook signature verification failed');
      return reply.status(400).send({ error: `Webhook signature verification failed: ${msg}` });
    }

    // Persist before enqueue. Idempotency via (provider, eventId) unique.
    let webhook;
    try {
      webhook = await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: 'STRIPE', eventId: event.id } },
        create: {
          provider: 'STRIPE',
          eventId: event.id,
          payload: event as unknown as object,
          status: 'PENDING',
        },
        update: {}, // No-op si ya existe — el worker lo manejará.
        select: { id: true, status: true },
      });
    } catch (err) {
      fastify.log.error({ err: (err as Error).message, eventId: event.id }, 'DB write failed');
      return reply.status(500).send({ error: 'Failed to persist webhook' });
    }

    // Si ya está procesado (idempotencia), no reencolamos.
    if (webhook.status === 'PROCESSED') {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // Encolamos solo el webhookId. El worker carga el payload desde DB.
    await ingestQueue.add(
      'stripe.ingestEvent',
      { webhookId: webhook.id },
      { jobId: webhook.id } // idempotency de BullMQ: no se duplica si el job ya existe
    );

    return reply.status(200).send({ received: true });
  });
};
