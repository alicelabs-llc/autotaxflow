import type { FastifyInstance } from 'fastify';
import { prisma, VatRegimeType, ProductType, Role } from '@autotaxflow/db';
import { zodSchema } from '../../lib/zod-schema';
import { z } from 'zod';
import { writeAudit, AuditAction } from '../../lib/audit';

const CreateVatRegistrationBody = z.object({
  regime: z.enum([
    'EU_OSS',
    'EU_IOSS',
    'UK_VAT',
    'AU_GST',
    'NZ_GST',
    'CA_GST_HST',
    'COUNTRY_VAT',
  ]),
  country: z.string().length(2),
  vatNumber: z.string().optional(),
  thresholdAmount: z.number().positive().optional(),
  thresholdCurrency: z.string().length(3).default('EUR'),
  notes: z.string().optional(),
});

const UpdateVatRegistrationBody = z.object({
  vatNumber: z.string().optional(),
  registeredAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

/**
 * VAT/GST endpoints — para tracking de registration cross-border y rates.
 *
 * GET   /api/orgs/:orgId/vat/rates/:country          — VAT rate para un país+productType
 * GET   /api/orgs/:orgId/vat/rates                    — todos los rates
 * POST  /api/orgs/:orgId/vat/registrations            — empezar tracking
 * GET   /api/orgs/:orgId/vat/registrations            — listar
 * PATCH /api/orgs/:orgId/vat/registrations/:id        — actualizar
 */
export async function vatRoutes(fastify: FastifyInstance) {
  // ---- Rates ----
  fastify.get('/rates', {
    preHandler: [fastify.authenticateJwt],
    handler: async (_request, reply) => {
      const rates = await prisma.vatRate.findMany({
        orderBy: [{ country: 'asc' }, { productType: 'asc' }],
      });
      if (rates.length === 0) {
        return reply.send({ rates: DEFAULT_VAT_RATES, source: 'fallback-oecd' });
      }
      return reply.send({ rates, source: 'database' });
    },
  });

  fastify.get('/rates/:country', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { country } = request.params as { country: string };
      const rates = await prisma.vatRate.findMany({
        where: { country: country.toUpperCase() },
      });
      if (rates.length === 0) {
        const fallback = DEFAULT_VAT_RATES.filter((r) => r.country === country.toUpperCase());
        return reply.send({ country: country.toUpperCase(), rates: fallback, source: 'fallback' });
      }
      return reply.send({ country: country.toUpperCase(), rates, source: 'database' });
    },
  });

  // ---- Registrations ----
  fastify.post('/registrations', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE),
    ],
    schema: { body: zodSchema(CreateVatRegistrationBody) },
    handler: async (request, reply) => {
      const body = request.body as ReturnType<typeof CreateVatRegistrationBody.parse>;
      const reg = await prisma.vatRegistration.upsert({
        where: {
          organizationId_regime_country: {
            organizationId: request.currentOrgId!,
            regime: body.regime as VatRegimeType,
            country: body.country.toUpperCase(),
          },
        },
        create: {
          organizationId: request.currentOrgId!,
          regime: body.regime as VatRegimeType,
          country: body.country.toUpperCase(),
          vatNumber: body.vatNumber,
          thresholdAmount: body.thresholdAmount || 0,
          thresholdCurrency: body.thresholdCurrency,
          notes: body.notes,
        },
        update: {},
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.ORG_UPDATED,
        entity: 'VatRegistration',
        entityId: reg.id,
        details: { regime: body.regime, country: body.country },
      });
      return reply.status(201).send({ registration: reg });
    },
  });

  fastify.get('/registrations', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const regs = await prisma.vatRegistration.findMany({
        where: { organizationId: request.currentOrgId! },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ registrations: regs });
    },
  });

  fastify.patch('/registrations/:id', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE),
    ],
    schema: { body: zodSchema(UpdateVatRegistrationBody) },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as ReturnType<typeof UpdateVatRegistrationBody.parse>;
      const reg = await prisma.vatRegistration.update({
        where: { id },
        data: {
          vatNumber: body.vatNumber,
          registeredAt: body.registeredAt ? new Date(body.registeredAt) : undefined,
          notes: body.notes,
        },
      });
      return reply.send({ registration: reg });
    },
  });
}

// ---- Default VAT rate fallback (subset of OECD 2025) ----
// Only the most common countries for cross-border SaaS. Real prod would
// load from a maintained DB (Avalara Vertex) — this is MVP baseline.
type VatRateRow = {
  country: string;
  vatRate: number;
  productType: ProductType;
  notes?: string;
};

const VAT_RATE_BY_COUNTRY: Record<string, number> = {
  // EU member states standard rate
  AT: 0.2, BE: 0.21, BG: 0.2, HR: 0.25, CY: 0.19, CZ: 0.21, DK: 0.25,
  EE: 0.22, FI: 0.255, FR: 0.2, DE: 0.19, GR: 0.24, HU: 0.27, IE: 0.23,
  IT: 0.22, LV: 0.21, LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21, PL: 0.23,
  PT: 0.23, RO: 0.19, SK: 0.2, SI: 0.22, ES: 0.21, SE: 0.25,
  // Non-EU
  GB: 0.2, NO: 0.25, CH: 0.081, AU: 0.1, NZ: 0.15, CA: 0.05, JP: 0.1,
  KR: 0.1, SG: 0.09, IN: 0.18, BR: 0.17, MX: 0.16,
};

function buildDefaultVatRates(): VatRateRow[] {
  const out: VatRateRow[] = [];
  for (const [country, rate] of Object.entries(VAT_RATE_BY_COUNTRY)) {
    // SaaS_SUBSCRIPTION and DIGITAL_GOOD are taxable at standard rate in most jurisdictions
    out.push({ country, vatRate: rate, productType: ProductType.SAAS_SUBSCRIPTION });
    out.push({ country, vatRate: rate, productType: ProductType.DIGITAL_GOOD });
    // PHYSICAL_GOOD also at standard rate (exceptions not modeled)
    out.push({ country, vatRate: rate, productType: ProductType.PHYSICAL_GOOD });
    // SERVICE often zero-rated or reduced — keep standard for fallback
    out.push({ country, vatRate: rate, productType: ProductType.SERVICE });
    out.push({
      country,
      vatRate: rate,
      productType: ProductType.MARKETPLACE_FACILITATOR_SALE,
    });
  }
  return out;
}

const DEFAULT_VAT_RATES: VatRateRow[] = buildDefaultVatRates();
