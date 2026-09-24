import { describe, it, expect } from 'vitest';
import { Tier, Role } from '@autotaxflow/db';
import {
  TIER_LIMITS,
  tierLimit,
  canAccessCpaPortal,
  TIER_STRIPE_PRICE_ID,
} from './tier-limits';

describe('TIER_LIMITS', () => {
  it('has all 5 tiers', () => {
    expect(Object.keys(TIER_LIMITS).length).toBe(5);
    expect(TIER_LIMITS.FREE.priceMonthly).toBe(0);
    expect(TIER_LIMITS.STARTER.priceMonthly).toBe(79);
    expect(TIER_LIMITS.PRO.priceMonthly).toBe(149);
    expect(TIER_LIMITS.BUSINESS.priceMonthly).toBe(299);
    expect(TIER_LIMITS.CPA_PARTNER.priceMonthly).toBe(49);
  });

  it('FREE tier restricts most features', () => {
    const f = TIER_LIMITS.FREE;
    expect(f.canExportReports).toBe(false);
    expect(f.canQboSync).toBe(false);
    expect(f.canCpaPortal).toBe(false);
    expect(f.canApiAccess).toBe(false);
    expect(f.canPdfExport).toBe(false);
    expect(f.canCustomRules).toBe(false);
  });

  it('BUSINESS tier unlocks everything', () => {
    const b = TIER_LIMITS.BUSINESS;
    expect(b.canExportReports).toBe(true);
    expect(b.canQboSync).toBe(true);
    expect(b.canCpaPortal).toBe(true);
    expect(b.canApiAccess).toBe(true);
    expect(b.canPdfExport).toBe(true);
    expect(b.canCustomRules).toBe(true);
    expect(b.canExpenseCategorization).toBe(true);
  });

  it('STARTER allows CSV export but not PDF', () => {
    const s = TIER_LIMITS.STARTER;
    expect(s.canExportReports).toBe(true);
    expect(s.canPdfExport).toBe(false);
    expect(s.canQboSync).toBe(false);
    expect(s.canCpaPortal).toBe(false);
  });

  it('enforces max connected accounts per provider by tier', () => {
    expect(TIER_LIMITS.FREE.maxConnectedAccounts).toBe(1);
    expect(TIER_LIMITS.STARTER.maxConnectedAccounts).toBe(1);
    expect(TIER_LIMITS.PRO.maxConnectedAccounts).toBe(2);
    expect(TIER_LIMITS.BUSINESS.maxConnectedAccounts).toBe(10);
  });

  it('max rules scales with tier', () => {
    expect(TIER_LIMITS.FREE.maxRules).toBe(1);
    expect(TIER_LIMITS.STARTER.maxRules).toBe(3);
    expect(TIER_LIMITS.PRO.maxRules).toBe(10);
    expect(TIER_LIMITS.BUSINESS.maxRules).toBe(50);
  });
});

describe('tierLimit helper', () => {
  it('returns the same object as direct access', () => {
    expect(tierLimit(Tier.PRO)).toBe(TIER_LIMITS.PRO);
  });
});

describe('canAccessCpaPortal', () => {
  it('allows CPA_READONLY regardless of tier', () => {
    expect(canAccessCpaPortal(Role.CPA_READONLY, Tier.STARTER)).toBe(true);
    expect(canAccessCpaPortal(Role.CPA_READONLY, Tier.PRO)).toBe(true);
    expect(canAccessCpaPortal(Role.CPA_READONLY, Tier.BUSINESS)).toBe(true);
  });

  it('allows OWNER/ADMIN only on BUSINESS tier', () => {
    expect(canAccessCpaPortal(Role.OWNER, Tier.BUSINESS)).toBe(true);
    expect(canAccessCpaPortal(Role.ADMIN, Tier.BUSINESS)).toBe(true);
    expect(canAccessCpaPortal(Role.OWNER, Tier.PRO)).toBe(false);
    expect(canAccessCpaPortal(Role.OWNER, Tier.STARTER)).toBe(false);
  });

  it('denies FINANCE/VIEWER always', () => {
    expect(canAccessCpaPortal(Role.FINANCE, Tier.BUSINESS)).toBe(false);
    expect(canAccessCpaPortal(Role.VIEWER, Tier.BUSINESS)).toBe(false);
  });
});

describe('TIER_STRIPE_PRICE_ID', () => {
  it('FREE has no price id (cannot subscribe)', () => {
    expect(TIER_STRIPE_PRICE_ID.FREE).toBeNull();
  });
  it('paid tiers have placeholder price ids', () => {
    expect(TIER_STRIPE_PRICE_ID.STARTER).toContain('price_');
    expect(TIER_STRIPE_PRICE_ID.PRO).toContain('price_');
    expect(TIER_STRIPE_PRICE_ID.BUSINESS).toContain('price_');
    expect(TIER_STRIPE_PRICE_ID.CPA_PARTNER).toContain('price_');
  });
});
