import { prisma, ProviderName } from '@autotaxflow/db';
import { decryptToken } from '../lib/qbo-crypto';
import { env } from '../lib/env';
import { z } from 'zod';

const QboSyncJob = z.object({
  connectedAccountId: z.string().uuid(),
});
export type QboSyncJobData = z.infer<typeof QboSyncJob>;

/**
 * Sync jobs de QBO.
 * - sync.qbo.accounts: sincroniza el Chart of Accounts de QBO a nuestra tabla Account.
 * - sync.qbo.transactions: sincroniza transactions recientes (60 días) desde QBO.
 *
 * Ambos jobs usan el token cifrado (AES-256-GCM) persistido en OAuthToken
 * al completar el OAuth flow (apps/api/src/routes/integrations/qbo.ts).
 *
 * Para invocar QBO API:
 *   GET https://<environment>.api.intuit.com/v3/company/<realmId>/query?query=...
 *   Authorization: Bearer <accessToken>
 *   Accept: application/json
 */

const QBO_API_BASE = env.QBO_ENVIRONMENT === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

interface QboAccount {
  Id: string;
  Name: string;
  AccountType: string;
  Classification?: string;
  CurrentBalance?: number;
  Currency?: { Value: string };
}

interface QboAccountResponse {
  QueryResponse?: {
    Account?: QboAccount[];
    maxResults?: number;
  };
  fault?: { Error: Array<{ Message: string; code: string }> };
}

interface QboSalesReceipt {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  TotalAmt: number;
  CurrencyRef?: { value: string };
  CustomerRef?: { value: string; name?: string };
  BillEmail?: { Address: string };
  ShipAddr?: { CountrySubDivisionCode?: string; Country?: string };
  Line?: Array<{ Amount?: number }>;
}

interface QboSalesReceiptResponse {
  QueryResponse?: {
    SalesReceipt?: QboSalesReceipt[];
    maxResults?: number;
  };
  fault?: { Error: Array<{ Message: string; code: string }> };
}

export async function processQboSyncAccounts(data: QboSyncJobData) {
  const { connectedAccountId } = data;
  const account = await prisma.connectedAccount.findUnique({
    where: { id: connectedAccountId },
    include: { oauthTokens: true, organization: true },
  });
  if (!account || !account.oauthTokens) {
    throw new Error(`QBO sync: connected account ${connectedAccountId} not found or no tokens`);
  }

  const accessToken = decryptToken(account.oauthTokens.accessTokenEncrypted);
  const realmId = account.externalAccountId;

  // Query all accounts
  const url = `${QBO_API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(
    'SELECT * FROM Account MAXRESULTS 1000'
  )}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`QBO API error: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as QboAccountResponse;
  if (body.fault) {
    throw new Error(`QBO fault: ${body.fault.Error.map((e) => e.Message).join('; ')}`);
  }

  const qboAccounts = body.QueryResponse?.Account || [];
  console.log(`[qbo-sync] got ${qboAccounts.length} accounts for org ${account.organization.name}`);

  // Upsert to our Account table
  for (const qa of qboAccounts) {
    await prisma.account.upsert({
      where: {
        organizationId_sourceProvider_sourceId: {
          organizationId: account.organizationId,
          sourceProvider: ProviderName.QUICKBOOKS,
          sourceId: qa.Id,
        },
      },
      create: {
        organizationId: account.organizationId,
        sourceProvider: ProviderName.QUICKBOOKS,
        sourceId: qa.Id,
        name: qa.Name,
        type: qa.AccountType,
        classification: qa.Classification || null,
      },
      update: {
        name: qa.Name,
        type: qa.AccountType,
        classification: qa.Classification || null,
      },
    });
  }

  // Mark sync time
  await prisma.connectedAccount.update({
    where: { id: connectedAccountId },
    data: { lastSyncAt: new Date() },
  });

  return { syncedAccounts: qboAccounts.length };
}

export async function processQboSyncTransactions(data: QboSyncJobData) {
  const { connectedAccountId } = data;
  const account = await prisma.connectedAccount.findUnique({
    where: { id: connectedAccountId },
    include: { oauthTokens: true },
  });
  if (!account || !account.oauthTokens) {
    throw new Error(`QBO sync: account ${connectedAccountId} not found or no tokens`);
  }

  const accessToken = decryptToken(account.oauthTokens.accessTokenEncrypted);
  const realmId = account.externalAccountId;

  // Query SalesReceipts from the last 60 days
  const dateFrom = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const query = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${dateFrom}' MAXRESULTS 500`;
  const url = `${QBO_API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`QBO API error: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as QboSalesReceiptResponse;
  if (body.fault) {
    throw new Error(`QBO fault: ${body.fault.Error.map((e) => e.Message).join('; ')}`);
  }

  const receipts = body.QueryResponse?.SalesReceipt || [];
  console.log(`[qbo-sync] got ${receipts.length} sales receipts`);

  // Upsert as Transaction records
  for (const r of receipts) {
    const occurredAt = new Date(r.TxnDate);
    const customerState = r.ShipAddr?.CountrySubDivisionCode || null;
    const customerCountry = r.ShipAddr?.Country || null;

    await prisma.transaction.upsert({
      where: {
        organizationId_sourceProvider_sourceId: {
          organizationId: account.organizationId,
          sourceProvider: ProviderName.QUICKBOOKS,
          sourceId: r.Id,
        },
      },
      create: {
        organizationId: account.organizationId,
        sourceProvider: ProviderName.QUICKBOOKS,
        sourceId: r.Id,
        type: 'CHARGE',
        amount: r.TotalAmt,
        currency: r.CurrencyRef?.value?.toUpperCase() || 'USD',
        occurredAt,
        customerState,
        customerCountry,
        rawJson: r as unknown as object,
      },
      update: {},
    });
  }

  await prisma.connectedAccount.update({
    where: { id: connectedAccountId },
    data: { lastSyncAt: new Date() },
  });

  return { syncedReceipts: receipts.length };
}
