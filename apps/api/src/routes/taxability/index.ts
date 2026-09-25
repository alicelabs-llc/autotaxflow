import type { FastifyInstance } from 'fastify';
import { prisma, ProductType } from '@autotaxflow/db';

/**
 * GET /api/taxability                    — lista toda la matriz (state × productType)
 * GET /api/taxability/:state             — todos los product types para un estado
 * GET /api/taxability/:state/:productType — registro específico
 *
 * Si la DB no tiene seed (tabla vacía), el endpoint devuelve defaults Wayfair:
 *   - SaaS_SUBSCRIPTION y DIGITAL_GOOD son taxable en ~30 estados (post-South Dakota v. Wayfair)
 *   - PHYSICAL_GOOD es taxable en los 50
 *   - SERVICE varía
 */
export async function taxabilityRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    preHandler: [fastify.authenticateJwt],
    handler: async (_request, reply) => {
      const rows = await prisma.productTaxability.findMany({
        orderBy: [{ state: 'asc' }, { productType: 'asc' }],
      });
      if (rows.length === 0) {
        return reply.send({ matrix: DEFAULT_MATRIX, source: 'fallback-defaults' });
      }
      return reply.send({ matrix: rows, source: 'database' });
    },
  });

  fastify.get('/:state', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { state } = request.params as { state: string };
      const rows = await prisma.productTaxability.findMany({
        where: { state: state.toUpperCase() },
      });
      if (rows.length === 0) {
        const fallback = DEFAULT_MATRIX.filter((r) => r.state === state.toUpperCase());
        return reply.send({ state: state.toUpperCase(), matrix: fallback, source: 'fallback-defaults' });
      }
      return reply.send({ state: state.toUpperCase(), matrix: rows, source: 'database' });
    },
  });

  fastify.get('/:state/:productType', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { state, productType } = request.params as { state: string; productType: ProductType };
      const row = await prisma.productTaxability.findUnique({
        where: {
          state_productType: { state: state.toUpperCase(), productType },
        },
      });
      if (!row) {
        const fallback = DEFAULT_MATRIX.find(
          (r) => r.state === state.toUpperCase() && r.productType === productType
        );
        return reply.send({ ...(row || fallback), source: row ? 'database' : 'fallback-defaults' });
      }
      return reply.send({ ...row, source: 'database' });
    },
  });
}

// ---------------------------------------------------------
// DEFAULT TAXABILITY MATRIX — Wayfair 2018 default fallback
// Cuando la DB no tiene seed, devolvemos este baseline conservador.
// Para SaaS_SUBSCRIPTION: taxable en estados que sigan el marco Streamlined
// Sales Tax + states que explícitamente gravan SaaS (post-2018 Wayfair).
// Para PHYSICAL_GOOD: taxable en los 45 estados con sales tax + DC.
// Refs: Tax Foundation 2025, state DOR publications.
// ---------------------------------------------------------

type TaxabilityRow = {
  state: string;
  productType: ProductType;
  taxable: boolean;
  rate: number;
  notes?: string;
};

// Estados con sales tax (45 + DC). Los 5 sin sales tax: AK, DE, MT, NH, OR.
const STATES_WITH_SALES_TAX = [
  'AL','AZ','AR','CA','CO','CT','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','OH','OK','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const STATES_TAXING_SAAS = [
  // States que explícitamente gravan SaaS post-Wayfair (no exhaustivo, ver state DOR).
  'AL','AZ','AR','CA','CO','CT','HI','IA','IL','KY','LA','MA','MD','MN','MS','NJ','NY','NC','OH','PA','RI','SD','TN','TX','UT','VT','WA','WI','WV','WY',
];

const STATES_TAXING_DIGITAL_GOOD = [
  // Approx 36 states tax digital goods.
  'AL','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','OH','OK','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const STATES_TAXING_SERVICES = [
  // Only ~15 states tax general services; most don't.
  'AR','HI','IA','ID','KY','MN','MS','NM','OH','SD','TN','TX','UT','WV','WI',
];

function buildDefaultMatrix(): TaxabilityRow[] {
  const rows: TaxabilityRow[] = [];
  for (const state of STATES_WITH_SALES_TAX) {
    rows.push({
      state,
      productType: ProductType.PHYSICAL_GOOD,
      taxable: true,
      rate: getSalesTaxRate(state),
      notes: 'Default state base sales tax rate',
    });
    rows.push({
      state,
      productType: ProductType.SAAS_SUBSCRIPTION,
      taxable: STATES_TAXING_SAAS.includes(state),
      rate: STATES_TAXING_SAAS.includes(state) ? getSalesTaxRate(state) : 0,
      notes: 'SaaS taxability varies; some states (CA, NY) treat as non-taxable service',
    });
    rows.push({
      state,
      productType: ProductType.DIGITAL_GOOD,
      taxable: STATES_TAXING_DIGITAL_GOOD.includes(state),
      rate: STATES_TAXING_DIGITAL_GOOD.includes(state) ? getSalesTaxRate(state) : 0,
      notes: 'Post-Wayfair: many states treat digital goods as tangible personal property',
    });
    rows.push({
      state,
      productType: ProductType.SERVICE,
      taxable: STATES_TAXING_SERVICES.includes(state),
      rate: STATES_TAXING_SERVICES.includes(state) ? getSalesTaxRate(state) : 0,
      notes: 'Most states do not tax professional services',
    });
    rows.push({
      state,
      productType: ProductType.MARKETPLACE_FACILITATOR_SALE,
      taxable: true,
      rate: getSalesTaxRate(state),
      notes: 'Marketplace facilitator collects and remits on seller behalf (post-Wayfair)',
    });
  }
  // States WITHOUT sales tax — all false
  for (const state of ['AK', 'DE', 'MT', 'NH', 'OR']) {
    for (const productType of Object.values(ProductType)) {
      rows.push({
        state,
        productType,
        taxable: false,
        rate: 0,
        notes: 'State has no general sales tax',
      });
    }
  }
  return rows;
}

const DEFAULT_MATRIX = buildDefaultMatrix();

function getSalesTaxRate(state: string): number {
  // 2025 combined state + average local rate (rounded to 4 decimals). Source: Tax Foundation.
  const RATES: Record<string, number> = {
    AL: 0.0922, AZ: 0.0839, AR: 0.0946, CA: 0.0882, CO: 0.0778, CT: 0.0635,
    FL: 0.0701, GA: 0.0735, HI: 0.0441, ID: 0.0601, IL: 0.0882, IN: 0.07,
    IA: 0.0694, KS: 0.0866, KY: 0.06, LA: 0.0945, ME: 0.055, MD: 0.06,
    MA: 0.0625, MI: 0.06, MN: 0.0747, MS: 0.0707, MO: 0.0825, NE: 0.0685,
    NV: 0.0823, NJ: 0.0663, NM: 0.0766, NY: 0.0852, NC: 0.0698, ND: 0.0696,
    OH: 0.0722, OK: 0.0893, PA: 0.0634, RI: 0.07, SC: 0.0711, SD: 0.064,
    TN: 0.0953, TX: 0.0819, UT: 0.0719, VT: 0.0666, VA: 0.0575, WA: 0.0929,
    WV: 0.0647, WI: 0.0543, WY: 0.0522, DC: 0.06,
  };
  return RATES[state] ?? 0;
}
