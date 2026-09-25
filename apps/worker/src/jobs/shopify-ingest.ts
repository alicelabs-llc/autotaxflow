import { prisma, ProviderName, TransactionType, WebhookStatus } from '@autotaxflow/db';
import { z } from 'zod';
import { aggregateQueue } from '../lib/bullmq';

const ShopifyIngestJob = z.object({
  webhookId: z.string().uuid(),
  topic: z.string(),
  shopDomain: z.string().optional(),
  apiVersion: z.string().optional(),
});
export type ShopifyIngestJobData = z.infer<typeof ShopifyIngestJob>;

interface ShopifyAddress {
  province_code?: string | null;
  country_code?: string | null;
  province?: string | null;
  country?: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string; // #1001
  email?: string | null;
  total_price: string; // "123.45" en USD (currency del shop)
  currency: string;
  created_at: string; // ISO
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
  customer?: { id: number; email?: string | null; default_address?: ShopifyAddress | null } | null;
  refunds?: Array<{
    id: number;
    created_at: string;
    transactions?: Array<{
      amount: string;
      gateway?: string;
    }>;
  }>;
  payment_gateway_names?: string[];
  gateway?: string;
}

interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  processed_at?: string | null;
  transactions?: Array<{
    amount: string;
    gateway?: string;
  }>;
}

/**
 * Procesador de ingesta de Shopify. Job data: { webhookId, topic, ... }.
 * El payload se carga desde DB por webhookId.
 *
 * Topics soportados:
 *   - orders/create  → upsert Transaction(CHARGE)
 *   - orders/paid    → idem (no-op si ya existe)
 *   - refunds/create → upsert Transaction(REFUND)
 */
export async function processShopifyIngest(data: ShopifyIngestJobData) {
  const { webhookId, topic } = data;

  const webhook = await prisma.webhookEvent.findUnique({ where: { id: webhookId } });
  if (!webhook) throw new Error(`WebhookEvent ${webhookId} not found`);
  if (webhook.status === WebhookStatus.PROCESSED) {
    console.log(`[shopify-ingest] webhook ${webhookId} already processed`);
    return;
  }

  await prisma.webhookEvent.update({
    where: { id: webhookId },
    data: { status: WebhookStatus.PROCESSING },
  });

  try {
    const payload = webhook.payload as unknown;

    // Lookup tenant by shopDomain via ConnectedAccount(externalAccountId=shop_domain)
    const shopDomain = data.shopDomain || (payload as any)?.shop_domain;
    if (!shopDomain) {
      console.warn(`[shopify-ingest] webhook ${webhookId} has no shopDomain, cannot resolve tenant`);
      await prisma.webhookEvent.update({
        where: { id: webhookId },
        data: { status: WebhookStatus.ERROR, error: 'Missing shopDomain' },
      });
      return;
    }

    const account = await prisma.connectedAccount.findFirst({
      where: { provider: ProviderName.SHOPIFY, externalAccountId: shopDomain },
      select: { organizationId: true },
    });
    if (!account) {
      console.warn(`[shopify-ingest] no ConnectedAccount for shop ${shopDomain}`);
      await prisma.webhookEvent.update({
        where: { id: webhookId },
        data: { status: WebhookStatus.ERROR, error: `No tenant for shop ${shopDomain}` },
      });
      return;
    }

    const organizationId = account.organizationId;

    switch (topic) {
      case 'orders/create':
      case 'orders/paid':
      case 'orders/updated':
        await handleOrderCreate(payload as ShopifyOrder, organizationId);
        break;
      case 'refunds/create':
        await handleRefundCreate(payload as ShopifyRefund, organizationId);
        break;
      default:
        console.log(`[shopify-ingest] topic ${topic} has no handler (webhook ${webhookId})`);
    }

    await prisma.webhookEvent.update({
      where: { id: webhookId },
      data: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
    });
  } catch (err) {
    await prisma.webhookEvent
      .update({
        where: { id: webhookId },
        data: { status: WebhookStatus.ERROR, error: (err as Error).message },
      })
      .catch(() => {});
    throw err;
  }
}

async function handleOrderCreate(order: ShopifyOrder, organizationId: string) {
  const occurredAt = new Date(order.created_at);
  const state = extractState(order);
  const country = extractCountry(order);
  const amount = parseFloat(order.total_price || '0');

  // Idempotencia por (orgId, sourceProvider=SHOPIFY, sourceId=order.id_str)
  await prisma.transaction.upsert({
    where: {
      organizationId_sourceProvider_sourceId: {
        organizationId,
        sourceProvider: ProviderName.SHOPIFY,
        sourceId: String(order.id),
      },
    },
    create: {
      organizationId,
      sourceProvider: ProviderName.SHOPIFY,
      sourceId: String(order.id),
      type: TransactionType.CHARGE,
      amount,
      currency: order.currency.toUpperCase(),
      occurredAt,
      customerState: state,
      customerCountry: country,
      rawJson: order as unknown as object,
    },
    update: {}, // no-op si ya existe
  });

  if (state) {
    await aggregateQueue.add(
      'aggregate.revenueDaily',
      { organizationId, date: occurredAt.toISOString().slice(0, 10), state },
      { jobId: `${organizationId}:${occurredAt.toISOString().slice(0, 10)}:${state}` }
    );
  }
}

async function handleRefundCreate(refund: ShopifyRefund, organizationId: string) {
  const occurredAt = new Date(refund.created_at);
  // Sum all transactions in the refund (refunds can have multiple transactions).
  // parseFloat may return NaN on malformed input — guard with Number.isFinite.
  const amount = (refund.transactions || []).reduce((s, t) => {
    const n = parseFloat(t?.amount || '0');
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  // Look up the original order to get state/country for the refund.
  // Shopify includes order_id in refund payload. We need to look up the existing
  // Transaction in our DB to get the original customer state.
  const originalTx = await prisma.transaction.findUnique({
    where: {
      organizationId_sourceProvider_sourceId: {
        organizationId,
        sourceProvider: ProviderName.SHOPIFY,
        sourceId: String(refund.order_id),
      },
    },
    select: { customerState: true, customerCountry: true, currency: true },
  });

  const state = originalTx?.customerState ?? null;
  const country = originalTx?.customerCountry ?? null;
  const currency = originalTx?.currency ?? 'USD';

  await prisma.transaction.upsert({
    where: {
      organizationId_sourceProvider_sourceId: {
        organizationId,
        sourceProvider: ProviderName.SHOPIFY,
        sourceId: `refund_${refund.id}`,
      },
    },
    create: {
      organizationId,
      sourceProvider: ProviderName.SHOPIFY,
      sourceId: `refund_${refund.id}`,
      type: TransactionType.REFUND,
      amount: Math.abs(amount),
      currency,
      occurredAt,
      customerState: state,
      customerCountry: country,
      rawJson: refund as unknown as object,
    },
    update: {},
  });

  if (state) {
    await aggregateQueue.add(
      'aggregate.revenueDaily',
      { organizationId, date: occurredAt.toISOString().slice(0, 10), state },
      { jobId: `${organizationId}:${occurredAt.toISOString().slice(0, 10)}:${state}` }
    );
  }
}

function extractState(order: ShopifyOrder): string | null {
  return (
    order.billing_address?.province_code ||
    order.shipping_address?.province_code ||
    order.billing_address?.province ||
    order.shipping_address?.province ||
    order.customer?.default_address?.province_code ||
    null
  );
}

function extractCountry(order: ShopifyOrder): string | null {
  return (
    order.billing_address?.country_code ||
    order.shipping_address?.country_code ||
    order.billing_address?.country ||
    order.shipping_address?.country ||
    order.customer?.default_address?.country_code ||
    null
  );
}
