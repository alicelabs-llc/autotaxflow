import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { prisma, Tier, SubscriptionStatus } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { TIER_LIMITS, TIER_STRIPE_PRICE_ID } from '../../lib/tier-limits';
import { zodSchema } from '../../lib/zod-schema';
import { z } from 'zod';
import { writeAudit, AuditAction } from '../../lib/audit';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || undefined!, {});

const SubscribeBody = z.object({
  tier: z.enum(['STARTER', 'PRO', 'BUSINESS', 'CPA_PARTNER']),
  orgId: z.string().uuid(),
});

/**
 * POST   /api/billing/subscribe    — inicia checkout de Stripe para un tier
 * GET    /api/billing/portal/:orgId — devuelve URL al Stripe Customer Portal
 * POST   /api/billing/webhook       — recibe eventos de Stripe Billing (customer.subscription.*)
 */
export async function billingRoutes(fastify: FastifyInstance) {
  fastify.post('/subscribe', {
    preHandler: [fastify.authenticateJwt],
    schema: { body: zodSchema(SubscribeBody) },
    handler: async (request, reply) => {
      const { sub: userId } = request.user;
      const { tier, orgId } = request.body as ReturnType<typeof SubscribeBody.parse>;

      const membership = await prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        include: { organization: { include: { subscriptions: true } } },
      });
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return reply.status(403).send({ error: 'Only OWNER/ADMIN can change billing tier' });
      }

      const priceId = TIER_STRIPE_PRICE_ID[tier as Tier];
      if (!priceId) {
        return reply.status(400).send({ error: `Tier ${tier} has no Stripe price configured` });
      }

      let stripeCustomerId = membership.organization.subscriptions[0]?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: request.user.email,
          name: membership.organization.name,
          metadata: { organizationId: orgId, tier },
        });
        stripeCustomerId = customer.id;

        await prisma.subscription.create({
          data: {
            organizationId: orgId,
            tier: tier as Tier,
            status: SubscriptionStatus.TRIALING,
            stripeCustomerId,
          },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${env.WEB_ORIGIN}/dashboard?billing=success`,
        cancel_url: `${env.WEB_ORIGIN}/dashboard?billing=cancel`,
        metadata: { organizationId: orgId, tier },
      });

      await writeAudit({
        organizationId: orgId,
        userId,
        action: AuditAction.ORG_UPDATED,
        entity: 'Subscription',
        details: { newTier: tier, sessionId: session.id },
      });

      return reply.send({ url: session.url });
    },
  });

  fastify.get('/portal/:orgId', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const sub = await prisma.subscription.findFirst({
        where: {
          organizationId: orgId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING],
          },
        },
      });
      if (!sub?.stripeCustomerId) {
        return reply.status(404).send({ error: 'No active Stripe subscription' });
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${env.WEB_ORIGIN}/dashboard`,
      });
      return reply.send({ url: portal.url });
    },
  });

  // Webhook de Stripe Billing — raw body, signature verified.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string;
    const secret = env.STRIPE_BILLING_WEBHOOK_SECRET;
    if (!sig || !secret) {
      return reply.status(400).send({ error: 'Missing signature or secret' });
    }

    let event: Stripe.Event;
    try {
      const rawBody = request.body as Buffer;
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err) {
      fastify.log.warn({ msg: (err as Error).message }, 'Billing webhook signature failed');
      return reply.status(400).send({ error: 'Signature verification failed' });
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const orgId = sub.metadata?.organizationId;
          const tier = sub.metadata?.tier as Tier | undefined;
          if (!orgId || !tier) break;
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: {
              status: sub.status as SubscriptionStatus,
              currentPeriodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000)
                : undefined,
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : undefined,
              cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
              tier,
            },
          });
          await prisma.organization.update({ where: { id: orgId }, data: { tier } });
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: { status: SubscriptionStatus.CANCELED },
          });
          const orgId = sub.metadata?.organizationId;
          if (orgId) {
            await prisma.organization.update({ where: { id: orgId }, data: { tier: Tier.FREE } });
          }
          break;
        }
        case 'invoice.paid':
          // Could send receipt email here.
          break;
        default:
          // Acknowledge but no-op
          break;
      }
    } catch (err) {
      fastify.log.error(
        { err: (err as Error).message, type: event.type },
        'Billing webhook handler error'
      );
    }

    return reply.status(200).send({ received: true });
  });
}
