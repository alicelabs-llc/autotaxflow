import { Tier, Role } from '@autotaxflow/db';

/**
 * Límites por tier. Driven by docs/ANALISIS_DE_NEGOCIO.md pricing matrix.
 * `maxRules` aplica a Ruleset.rules count. `maxMemberships` a org membership count.
 * `maxConnectedAccounts` aplica por provider (ej: Starter = 1 Stripe).
 */
export const TIER_LIMITS: Record<
  Tier,
  {
    priceMonthly: number;
    maxConnectedAccounts: number; // por provider
    maxMemberships: number;
    maxRules: number;
    canExportReports: boolean;
    canQboSync: boolean;
    canCpaPortal: boolean;
    canApiAccess: boolean;
    canPdfExport: boolean;
    canCustomRules: boolean;
    canExpenseCategorization: boolean;
    label: string;
  }
> = {
  FREE: {
    priceMonthly: 0,
    maxConnectedAccounts: 1,
    maxMemberships: 1,
    maxRules: 1,
    canExportReports: false,
    canQboSync: false,
    canCpaPortal: false,
    canApiAccess: false,
    canPdfExport: false,
    canCustomRules: false,
    canExpenseCategorization: false,
    label: 'Free Monitoring',
  },
  STARTER: {
    priceMonthly: 79,
    maxConnectedAccounts: 1,
    maxMemberships: 3,
    maxRules: 3,
    canExportReports: true, // CSV only
    canQboSync: false,
    canCpaPortal: false,
    canApiAccess: false,
    canPdfExport: false,
    canCustomRules: true,
    canExpenseCategorization: false,
    label: 'Starter',
  },
  PRO: {
    priceMonthly: 149,
    maxConnectedAccounts: 2,
    maxMemberships: 5,
    maxRules: 10,
    canExportReports: true,
    canQboSync: true,
    canCpaPortal: false,
    canApiAccess: false,
    canPdfExport: true,
    canCustomRules: true,
    canExpenseCategorization: true,
    label: 'Pro',
  },
  BUSINESS: {
    priceMonthly: 299,
    maxConnectedAccounts: 10,
    maxMemberships: 5,
    maxRules: 50,
    canExportReports: true,
    canQboSync: true,
    canCpaPortal: true,
    canApiAccess: true,
    canPdfExport: true,
    canCustomRules: true,
    canExpenseCategorization: true,
    label: 'Business',
  },
  CPA_PARTNER: {
    priceMonthly: 49,
    maxConnectedAccounts: 1,
    maxMemberships: 1,
    maxRules: 3,
    canExportReports: true,
    canQboSync: false,
    canCpaPortal: true,
    canApiAccess: false,
    canPdfExport: true,
    canCustomRules: false,
    canExpenseCategorization: false,
    label: 'CPA Partner (Read-only)',
  },
};

export function tierLimit(tier: Tier) {
  return TIER_LIMITS[tier];
}

/**
 * Devuelve true si el rol puede acceder al CPA portal.
 * Roles que pueden: CPA_READONLY. Roles que pueden en tier BUSINESS: OWNER/ADMIN.
 */
export function canAccessCpaPortal(role: Role, tier: Tier): boolean {
  if (role === Role.CPA_READONLY) return true;
  if (tier === Tier.BUSINESS && (role === Role.OWNER || role === Role.ADMIN)) return true;
  return false;
}

/**
 * Stripe Price IDs por tier (placeholder — se reemplaza por IDs reales de
 * Stripe Dashboard cuando se cree el producto en stripe.com).
 */
export const TIER_STRIPE_PRICE_ID: Record<Tier, string | null> = {
  FREE: null,
  STARTER: 'price_starter_monthly_usd79',
  PRO: 'price_pro_monthly_usd149',
  BUSINESS: 'price_business_monthly_usd299',
  CPA_PARTNER: 'price_cpa_partner_monthly_usd49',
};
