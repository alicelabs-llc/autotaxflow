import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { prisma, ProviderName } from '@autotaxflow/db';
import { env } from '../../lib/env';
import { zodSchema } from '../../lib/zod-schema';
import { z } from 'zod';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || undefined!, {});

const CalculateTaxBody = z.object({
  customerId: z.string().optional(),
  address: z
    .object({
      line1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      postalCode: z.string().optional(),
      country: z.string().length(2).default('US'),
    })
    .optional(),
  currency: z.string().length(3).default('USD'),
  lineItems: z
    .array(
      z.object({
        amount: z.number().positive(),
        reference: z.string(),
        quantity: z.number().int().positive().default(1),
        productType: z.string().optional(),
        taxCode: z.string().optional(),
      })
    )
    .min(1)
    .max(100),
});

/**
 * POST /api/orgs/:orgId/tax/calculate — wraps Stripe Tax calculation API.
 * POST /api/orgs/:orgId/tax/create-transaction — creates a Tax Transaction from a calculation.
 */
export async function taxCalculationRoutes(fastify: FastifyInstance) {
  fastify.post('/calculate', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    schema: { body: zodSchema(CalculateTaxBody) },
    handler: async (request, reply) => {
      const orgId = request.currentOrgId!;
      const body = request.body as ReturnType<typeof CalculateTaxBody.parse>;

      const connected = await prisma.connectedAccount.findFirst({
        where: { organizationId: orgId, provider: ProviderName.STRIPE },
      });
      if (!connected) {
        return reply.status(409).send({ error: 'No Stripe account connected for this org' });
      }

      let address: Stripe.AddressParam | undefined;
      if (!body.customerId && body.address) {
        address = {
          line1: body.address.line1,
          city: body.address.city,
          state: body.address.state,
          postal_code: body.address.postalCode,
          country: body.address.country,
        };
      }

      try {
        const calculation = (await stripe.tax.calculations.create(
          {
            currency: body.currency.toLowerCase(),
            line_items: body.lineItems.map((li) => ({
              amount: Math.round(li.amount),
              reference: li.reference,
              quantity: li.quantity,
              tax_code:
                li.taxCode || mapProductTypeToTaxCode(li.productType) || 'txcd_99999999',
            })),
            ...(body.customerId ? { customer: body.customerId } : {}),
            ...(address ? { customer_address: address } : {}),
          } as any,
          { stripeAccount: connected.externalAccountId }
        )) as any;

        const lineItems: any[] = calculation.line_items?.data || [];
        const taxBreakdown: any[] = calculation.tax_breakdown || [];
        const totalAmount = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
        const totalTax = taxBreakdown.reduce(
          (s, b) => s + (b.tax_amount || 0),
          0
        );

        return reply.send({
          id: calculation.id,
          currency: calculation.currency,
          totalAmount,
          totalTax,
          taxBreakdown,
          lineItems,
        });
      } catch (err) {
        fastify.log.error({ err: (err as Error).message }, 'Stripe Tax calculation failed');
        return reply.status(502).send({
          error: 'Stripe Tax calculation failed',
          detail: (err as Error).message,
        });
      }
    },
  });

  fastify.post('/create-transaction', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    schema: {
      body: zodSchema(
        z.object({
          calculationId: z.string(),
          invoiceId: z.string().optional(),
        })
      ),
    },
    handler: async (request, reply) => {
      const orgId = request.currentOrgId!;
      const { calculationId, invoiceId } = request.body as {
        calculationId: string;
        invoiceId?: string;
      };

      const connected = await prisma.connectedAccount.findFirst({
        where: { organizationId: orgId, provider: ProviderName.STRIPE },
      });
      if (!connected) {
        return reply.status(409).send({ error: 'No Stripe connected' });
      }

      try {
        // Stripe Tax Transactions.create via SDK (cast to any — signature
        // varies across stripe-node versions for the Tax namespace).
        const stripeAny = stripe as any;
        const txn = await stripeAny.tax.transactions.create(
          {
            calculation: calculationId,
            reference: invoiceId || `txn_${Date.now()}`,
          },
          { stripeAccount: connected.externalAccountId }
        );

        return reply.send({ id: txn.id, type: txn.type });
      } catch (err) {
        return reply.status(502).send({
          error: 'Stripe Tax transaction creation failed',
          detail: (err as Error).message,
        });
      }
    },
  });
}

function mapProductTypeToTaxCode(productType?: string): string | undefined {
  if (!productType) return undefined;
  const map: Record<string, string> = {
    SAAS_SUBSCRIPTION: 'txcd_90040001',
    DIGITAL_GOOD: 'txcd_40000003',
    PHYSICAL_GOOD: 'txcd_00000000',
    SERVICE: 'txcd_00000000',
    MARKETPLACE_FACILITATOR_SALE: 'txcd_00000000',
  };
  return map[productType];
}
