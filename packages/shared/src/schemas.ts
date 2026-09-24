import { z } from 'zod';

// ============================================================
// AutoTaxFlow - Shared Zod Schemas
// Used by the API gateway (apps/api) for request validation
// via fastify-zod, and by the worker for job payload validation.
// ============================================================

// ---- Primitives -------------------------------------------------

export const UuidSchema = z.string().uuid();

export const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const DateRangeQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

// ---- Auth & Organizations --------------------------------------

export const CreateOrgBody = z.object({
  name: z.string().min(2).max(100),
  country: z.string().length(2),
  baseCurrency: z.string().length(3).default('USD'),
});
export type CreateOrgInput = z.infer<typeof CreateOrgBody>;

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginBody>;

export const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof RegisterBody>;

export const AuthResponse = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
});
export type AuthOutput = z.infer<typeof AuthResponse>;

// ---- Transactions ----------------------------------------------

export const GetTransactionsQuery = PaginationQuery.merge(DateRangeQuery).extend({
  state: z.string().length(2).optional(),
  type: z.enum(['CHARGE', 'REFUND', 'PAYMENT', 'TRANSFER', 'DISPUTE']).optional(),
  provider: z.enum(['STRIPE', 'QUICKBOOKS']).optional(),
});

export const TransactionItem = z.object({
  id: z.string(),
  sourceProvider: z.string(),
  type: z.string(),
  amount: z.number(),
  currency: z.string(),
  occurredAt: z.string(),
  customerState: z.string().nullable(),
  category: z.string().nullable(),
});

export const TransactionListResponse = z.object({
  data: z.array(TransactionItem),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }),
});

// ---- Revenue by State ------------------------------------------

export const GetRevenueByStateQuery = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const StateRevenueItem = z.object({
  state: z.string(),
  grossRevenue: z.number(),
  netRevenue: z.number(),
  txCount: z.number(),
});

export const StateRevenueResponse = z.array(StateRevenueItem);

// ---- Risk Rules & Nexus Flags ----------------------------------

export const CreateRuleBody = z.object({
  rulesetId: z.string().uuid(),
  type: z.enum(['NEXUS_REVENUE_THRESHOLD', 'NEXUS_TX_THRESHOLD', 'EXPENSE_CAT']),
  params: z.record(z.any()),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  isActive: z.boolean().default(true),
});
export type CreateRuleInput = z.infer<typeof CreateRuleBody>;

export const CreateRulesetBody = z.object({
  name: z.string().min(2).max(100),
});
export type CreateRulesetInput = z.infer<typeof CreateRulesetBody>;

export const GetFlagsQuery = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
});

export const FlagItem = z.object({
  id: z.string(),
  state: z.string(),
  severity: z.string(),
  reason: z.string(),
  status: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});

export const UpdateFlagBody = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
});

// ---- Reports ---------------------------------------------------

export const RequestReportBody = z.object({
  type: z.enum(['MONTHLY_SUMMARY', 'CPA_EXPORT_CSV', 'NEXUS_RISK_PDF']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type RequestReportInput = z.infer<typeof RequestReportBody>;

export const DownloadReportResponse = z.object({
  downloadUrl: z.string().url(),
  expiresIn: z.number(),
});

// ---- Internal job payloads (BullMQ) ---------------------------

export const StripeIngestJob = z.object({
  webhookId: z.string().uuid(),
});
export type StripeIngestJobData = z.infer<typeof StripeIngestJob>;

export const ShopifyIngestJob = z.object({
  webhookId: z.string().uuid(),
  topic: z.string(),
  shopDomain: z.string().optional(),
  apiVersion: z.string().optional(),
});
export type ShopifyIngestJobData = z.infer<typeof ShopifyIngestJob>;

export const AggregateDailyJob = z.object({
  organizationId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  state: z.string().length(2),
});
export type AggregateDailyJobData = z.infer<typeof AggregateDailyJob>;

export const ReportJob = z.object({
  reportId: z.string().uuid(),
});
export type ReportJobData = z.infer<typeof ReportJob>;

// ---- Re-exports for convenience --------------------------------

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const API_VERSION = 'v1' as const;
