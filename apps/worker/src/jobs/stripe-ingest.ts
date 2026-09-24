import { prisma, ProviderName, TransactionType, WebhookStatus } from '@autotaxflow/db';
import type { StripeIngestJobData } from '@autotaxflow/shared';
import type Stripe from 'stripe';
import { aggregateQueue } from '../lib/bullmq';

/**
 * Procesador de ingesta de Stripe.
 *
 * Job data: { webhookId } — solo el ID. El payload se carga desde DB.
 * Esto evita 2 cosas:
 *   1) Duplicar el payload en memoria Redis (que se vence con BullMQ).
 *   2) Pérdida de eventos si Redis falla entre receive y process.
 *
 * Idempotencia: si el webhook ya está PROCESSED, no hace nada.
 * El job tiene jobId=webhookId así que BullMQ no encola duplicados del mismo ID.
 */
export async function processStripeIngest(data: StripeIngestJobData) {
  const { webhookId } = data;

  const webhook = await prisma.webhookEvent.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    throw new Error(`WebhookEvent ${webhookId} not found in DB`);
  }

  if (webhook.status === WebhookStatus.PROCESSED) {
    console.log(`[ingest] webhook ${webhookId} already processed, skipping`);
    return;
  }

  // Marcar PROCESSING
  await prisma.webhookEvent.update({
    where: { id: webhookId },
    data: { status: WebhookStatus.PROCESSING },
  });

  try {
    const event = webhook.payload as unknown as Stripe.Event;

    switch (event.type) {
      case 'charge.succeeded':
        await handleChargeSucceeded(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      default:
        console.log(`[ingest] event ${event.type} has no handler (webhook ${webhookId})`);
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
    throw err; // Para que BullMQ reintente
  }
}

/**
 * Lookup del tenant: para Connect webhooks el header `stripe-account` viene
 * como `acct_xxx`; para platform webhooks el payload `event.account` (Connect)
 * o usamos `charge.on_behalf_of`. Nunca `charge.customer` (es un cus_xxx).
 */
async function resolveTenant(opts: {
  stripeAccountId?: string;
  onBehalfOf?: string | null;
}): Promise<{ organizationId: string } | null> {
  const candidates = [opts.stripeAccountId, opts.onBehalfOf].filter(Boolean) as string[];
  if (candidates.length === 0) return null;

  const account = await prisma.connectedAccount.findFirst({
    where: {
      provider: ProviderName.STRIPE,
      externalAccountId: { in: candidates },
    },
    select: { organizationId: true },
  });
  return account ? { organizationId: account.organizationId } : null;
}

async function handleChargeSucceeded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  // Preferimos event.account (Connect webhook). Si no, charge.on_behalf_of.
  const stripeAccountId =
    (event.account as string | undefined) || (charge.on_behalf_of as string | null) || undefined;

  const tenant = await resolveTenant({
    stripeAccountId,
    onBehalfOf: (charge.on_behalf_of as string | null) || undefined,
  });
  if (!tenant) {
    console.warn(
      `[ingest] no tenant found for stripe account ${stripeAccountId} (charge ${charge.id})`
    );
    return;
  }

  // Idempotency por (orgId, sourceProvider, sourceId) → upsert hace la magia.
  const occurredAt = new Date(charge.created * 1000);
  const address = (charge.billing_details as any)?.address as
    | { state?: string | null; country?: string | null }
    | null
    | undefined;
  const customerState = address?.state || null;
  const customerCountry = address?.country || null;

  await prisma.transaction.upsert({
    where: {
      organizationId_sourceProvider_sourceId: {
        organizationId: tenant.organizationId,
        sourceProvider: ProviderName.STRIPE,
        sourceId: charge.id,
      },
    },
    create: {
      organizationId: tenant.organizationId,
      sourceProvider: ProviderName.STRIPE,
      sourceId: charge.id,
      type: TransactionType.CHARGE,
      amount: charge.amount / 100,
      currency: charge.currency.toUpperCase(),
      occurredAt,
      customerState,
      customerCountry,
      rawJson: charge as unknown as object,
    },
    update: {}, // Ya existe — no sobrescribimos. Refunds se manejan aparte.
  });

  // Encolar agregación diaria (idempotente).
  if (customerState) {
    const dateStr = occurredAt.toISOString().slice(0, 10);
    await aggregateQueue.add(
      'aggregate.revenueDaily',
      { organizationId: tenant.organizationId, date: dateStr, state: customerState },
      { jobId: `${tenant.organizationId}:${dateStr}:${customerState}` }
    );
  }
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const refund = (charge.refunds?.data || [])[0];
  if (!refund) return;

  const stripeAccountId =
    (event.account as string | undefined) || (charge.on_behalf_of as string | null) || undefined;
  const tenant = await resolveTenant({
    stripeAccountId,
    onBehalfOf: (charge.on_behalf_of as string | null) || undefined,
  });
  if (!tenant) {
    console.warn(`[ingest] refund: no tenant for charge ${charge.id}`);
    return;
  }

  const occurredAt = new Date(refund.created * 1000);
  const address = (charge.billing_details as any)?.address as
    | { state?: string | null; country?: string | null }
    | null
    | undefined;
  const customerState = address?.state || null;
  const customerCountry = address?.country || null;
  const refundSourceId = refund.id; // re_xxx

  // Insertamos la transacción REFUND (amount positivo en el payload de Stripe).
  await prisma.transaction.upsert({
    where: {
      organizationId_sourceProvider_sourceId: {
        organizationId: tenant.organizationId,
        sourceProvider: ProviderName.STRIPE,
        sourceId: refundSourceId,
      },
    },
    create: {
      organizationId: tenant.organizationId,
      sourceProvider: ProviderName.STRIPE,
      sourceId: refundSourceId,
      type: TransactionType.REFUND,
      amount: refund.amount / 100, // positivo en DB; la agregación lo resta de netRevenue
      currency: charge.currency.toUpperCase(),
      occurredAt,
      customerState,
      customerCountry,
      rawJson: refund as unknown as object,
    },
    update: {}, // idempotencia
  });

  if (customerState) {
    const dateStr = occurredAt.toISOString().slice(0, 10);
    await aggregateQueue.add(
      'aggregate.revenueDaily',
      { organizationId: tenant.organizationId, date: dateStr, state: customerState },
      { jobId: `${tenant.organizationId}:${dateStr}:${customerState}` }
    );
  }
}
