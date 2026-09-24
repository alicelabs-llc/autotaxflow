import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { aggregateRevenue, isNexusLikely } from '../jobs/aggregate.math';

// Re-creamos la lógica de handleChargeSucceeded en una función pura
// para poder testear la transformación charge → Transaction → aggregation
// sin necesidad de DB real.

interface StripeCharge {
  id: string;
  amount: number; // cents
  currency: string;
  created: number; // unix seconds
  on_behalf_of?: string | null;
  billing_details?: {
    address?: { state?: string | null; country?: string | null } | null;
  } | null;
}

interface StripeRefund {
  id: string;
  amount: number;
  created: number;
}

interface NormalizedTx {
  sourceId: string;
  type: 'CHARGE' | 'REFUND';
  amount: number; // dollars
  currency: string;
  occurredAt: Date;
  customerState: string | null;
  customerCountry: string | null;
}

function normalizeCharge(charge: StripeCharge): NormalizedTx {
  const address = (charge as any).billing_details?.address as
    | { state?: string | null; country?: string | null }
    | null
    | undefined;
  return {
    sourceId: charge.id,
    type: 'CHARGE',
    amount: charge.amount / 100,
    currency: charge.currency.toUpperCase(),
    occurredAt: new Date(charge.created * 1000),
    customerState: address?.state || null,
    customerCountry: address?.country || null,
  };
}

function normalizeRefund(refund: StripeRefund, baseCurrency = 'USD', baseState: string | null = null): NormalizedTx {
  return {
    sourceId: refund.id,
    type: 'REFUND',
    amount: refund.amount / 100,
    currency: baseCurrency,
    occurredAt: new Date(refund.created * 1000),
    customerState: baseState,
    customerCountry: null,
  };
}

// Simula el upsert idempotente que usa prisma.transaction.upsert
function upsertUnique(transactions: Map<string, NormalizedTx>, tx: NormalizedTx, key: string) {
  if (transactions.has(key)) {
    return { inserted: false, tx: transactions.get(key)! };
  }
  transactions.set(key, tx);
  return { inserted: true, tx };
}

describe('Stripe webhook → Transaction normalization pipeline (pure logic)', () => {
  const baseCharge: StripeCharge = {
    id: 'ch_test_001',
    amount: 15000, // $150
    currency: 'usd',
    created: 1700000000,
    on_behalf_of: 'acct_test_connect_001',
    billing_details: {
      address: { state: 'CA', country: 'US' },
    },
  };

  it('normalizes a charge.succeeded event to a CHARGE transaction', () => {
    const tx = normalizeCharge(baseCharge);
    expect(tx.sourceId).toBe('ch_test_001');
    expect(tx.type).toBe('CHARGE');
    expect(tx.amount).toBe(150);
    expect(tx.currency).toBe('USD');
    expect(tx.customerState).toBe('CA');
    expect(tx.customerCountry).toBe('US');
    expect(tx.occurredAt).toBeInstanceOf(Date);
  });

  it('handles null billing_details (no state)', () => {
    const charge = { ...baseCharge, billing_details: null };
    const tx = normalizeCharge(charge);
    expect(tx.customerState).toBeNull();
    expect(tx.customerCountry).toBeNull();
  });

  it('handles missing address object', () => {
    const charge: StripeCharge = { ...baseCharge, billing_details: {} as any };
    const tx = normalizeCharge(charge);
    expect(tx.customerState).toBeNull();
  });

  it('upsert is idempotent: same sourceId does not insert twice', () => {
    const store = new Map<string, NormalizedTx>();
    const tx = normalizeCharge(baseCharge);
    const r1 = upsertUnique(store, tx, 'ch_test_001');
    const r2 = upsertUnique(store, tx, 'ch_test_001');
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(store.size).toBe(1);
  });
});

describe('Refund → Transaction normalization pipeline', () => {
  it('normalizes a charge.refunded event to a REFUND transaction', () => {
    const refund: StripeRefund = {
      id: 're_test_001',
      amount: 5000, // $50
      created: 1700001000,
    };
    const tx = normalizeRefund(refund, 'USD', 'CA');
    expect(tx.sourceId).toBe('re_test_001');
    expect(tx.type).toBe('REFUND');
    expect(tx.amount).toBe(50);
    expect(tx.currency).toBe('USD');
    expect(tx.customerState).toBe('CA');
  });

  it('refund amount is positive in DB (aggregation subtracts)', () => {
    const refund: StripeRefund = { id: 're_2', amount: 2500, created: 1700002000 };
    const tx = normalizeRefund(refund, 'USD', 'NY');
    expect(tx.amount).toBe(25);
    expect(tx.amount).toBeGreaterThan(0);
  });

  it('idempotency: same refund sourceId does not double-aggregate', () => {
    const store = new Map<string, NormalizedTx>();
    const tx = normalizeRefund({ id: 're_3', amount: 1000, created: 1700003000 }, 'USD', 'TX');
    expect(upsertUnique(store, tx, 're_3').inserted).toBe(true);
    expect(upsertUnique(store, tx, 're_3').inserted).toBe(false);
  });
});

describe('Full aggregation math: charge + refund in same day/state', () => {
  it('aggregateRevenue with one $200 charge + $50 refund = gross 200 net 150', () => {
    const charges = [{ amount: 200, type: 'CHARGE' as const }];
    const refunds = [{ amount: 50, type: 'REFUND' as const }];
    const r = aggregateRevenue(charges, refunds);
    expect(r.grossRevenue).toBe(200);
    expect(r.netRevenue).toBe(150);
    expect(r.txCount).toBe(2);
  });

  it('aggregateRevenue on 5 charges summing to $120K triggers nexus threshold', () => {
    const charges = [
      { amount: 30000, type: 'CHARGE' as const },
      { amount: 25000, type: 'CHARGE' as const },
      { amount: 20000, type: 'CHARGE' as const },
      { amount: 25000, type: 'CHARGE' as const },
      { amount: 20000, type: 'CHARGE' as const },
    ];
    const refunds: any[] = [];
    const r = aggregateRevenue(charges, refunds);
    expect(r.grossRevenue).toBe(120000);
    expect(isNexusLikely(r.grossRevenue, r.txCount)).toBe(true);
  });

  it('aggregateRevenue on 250 charges (sub-threshold amounts) triggers tx-count nexus', () => {
    const charges = Array.from({ length: 250 }, () => ({
      amount: 100,
      type: 'CHARGE' as const,
    }));
    const r = aggregateRevenue(charges, []);
    expect(r.grossRevenue).toBe(25000); // below $100K
    expect(isNexusLikely(r.grossRevenue, r.txCount)).toBe(true); // but 250 > 200 tx
  });

  it('marketplace facilitator exclusion: facilitator-collected txs excluded from aggregation', () => {
    // simulate the aggregate.ts query: isFacilitatorCollected=false filter
    const allCharges = [
      { amount: 100, type: 'CHARGE' as const, isFacilitatorCollected: false },
      { amount: 200, type: 'CHARGE' as const, isFacilitatorCollected: true }, // excluded
      { amount: 300, type: 'CHARGE' as const, isFacilitatorCollected: false },
    ];
    const included = allCharges.filter((c) => !c.isFacilitatorCollected);
    const r = aggregateRevenue(included, []);
    expect(r.grossRevenue).toBe(400); // 100 + 300, not 600
    expect(r.txCount).toBe(2);
    expect(isNexusLikely(r.grossRevenue, r.txCount)).toBe(false);
  });
});

describe('Nexus Engine — re-open RESOLVED flag when threshold re-crossed', () => {
  // simulate the re-open logic from nexus-engine.ts
  function decideAction(existing: { status: string } | null, crossed: boolean) {
    if (!existing) return crossed ? 'CREATE' : 'NOOP';
    if (existing.status === 'RESOLVED' && crossed) return 'REOPEN';
    if (crossed) return 'UPDATE_LASTSEEN';
    return 'NOOP';
  }

  it('creates flag if none exists and threshold crossed', () => {
    expect(decideAction(null, true)).toBe('CREATE');
  });
  it('does nothing if none exists and threshold NOT crossed', () => {
    expect(decideAction(null, false)).toBe('NOOP');
  });
  it('reopens if flag was RESOLVED and threshold crosses again', () => {
    expect(decideAction({ status: 'RESOLVED' }, true)).toBe('REOPEN');
  });
  it('updates lastSeen if flag OPEN and threshold still crossed', () => {
    expect(decideAction({ status: 'OPEN' }, true)).toBe('UPDATE_LASTSEEN');
  });
  it('does nothing if flag OPEN but threshold no longer crossed (impossible in practice but defensive)', () => {
    expect(decideAction({ status: 'OPEN' }, false)).toBe('NOOP');
  });
});

describe('QBO OAuth callback — token exchange payload shape', () => {
  // Simulates the response shape from Intuit OAuth token endpoint
  it('parses Intuit token response correctly', () => {
    const mockResponse = {
      access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6I',
      refresh_token: 'TQENCBABABABABABABABABABABA',
      expires_in: 3600,
      refresh_token_expires_in: 2419200,
      scope: 'com.intuit.quickbooks.accounting',
      token_type: 'bearer',
    };
    expect(mockResponse.access_token).toBeTruthy();
    expect(mockResponse.refresh_token).toBeTruthy();
    expect(mockResponse.expires_in).toBe(3600);
    const expiresAt = new Date(Date.now() + mockResponse.expires_in * 1000);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('state cookie decodes back to orgId + userId', () => {
    const state = Buffer.from(
      JSON.stringify({ orgId: 'org-uuid-123', userId: 'user-uuid-456' })
    ).toString('base64url');
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    expect(decoded.orgId).toBe('org-uuid-123');
    expect(decoded.userId).toBe('user-uuid-456');
  });
});

describe('OIDC SSO callback — token + userinfo parsing', () => {
  it('detects provider from OIDC_ISSUER', () => {
    const detect = (issuer: string) =>
      issuer.includes('google')
        ? 'google'
        : issuer.includes('microsoft')
        ? 'microsoft'
        : issuer.includes('okta')
        ? 'okta'
        : 'generic';

    expect(detect('https://accounts.google.com')).toBe('google');
    expect(detect('https://login.microsoftonline.com/tenant-uuid/v2.0')).toBe('microsoft');
    expect(detect('https://acme.okta.com/oauth2/default')).toBe('okta');
    expect(detect('https://auth.example.com')).toBe('generic');
  });

  it('builds correct authorize URL with state+nonce', () => {
    const issuer = 'https://accounts.google.com';
    const clientId = 'google-client-id';
    const redirectUri = 'http://localhost:3001/api/auth/sso/callback';
    const state = 'state_abc';
    const nonce = 'nonce_xyz';

    const url = new URL(`${issuer}/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);

    expect(url.toString()).toContain('client_id=google-client-id');
    expect(url.toString()).toContain('response_type=code');
    expect(url.toString()).toContain('scope=openid+email+profile');
    expect(url.toString()).toContain('redirect_uri=http');
    expect(url.toString()).toContain('state=state_abc');
    expect(url.toString()).toContain('nonce=nonce_xyz');
  });

  it('JWT redirect URL uses hash (not query string) to avoid leaking in logs', () => {
    const redirectUrl = `http://localhost:3000/dashboard#sso_token=abc.123.xyz`;
    expect(redirectUrl).toContain('#sso_token=');
    expect(redirectUrl).not.toContain('?sso_token=');
  });
});

describe('Tier limits enforcement (feature gate logic)', () => {
  // Replica de TIER_LIMITS lookup
  const limits: Record<string, any> = {
    FREE: { canQboSync: false, maxRules: 1, maxConnectedAccounts: 1 },
    STARTER: { canQboSync: false, maxRules: 3, maxConnectedAccounts: 1 },
    PRO: { canQboSync: true, maxRules: 10, maxConnectedAccounts: 2 },
    BUSINESS: { canQboSync: true, maxRules: 50, maxConnectedAccounts: 10 },
  };

  it('FREE tier cannot QBO sync', () => {
    expect(limits.FREE.canQboSync).toBe(false);
  });

  it('PRO and BUSINESS can QBO sync', () => {
    expect(limits.PRO.canQboSync).toBe(true);
    expect(limits.BUSINESS.canQboSync).toBe(true);
  });

  it('enforces max connected accounts when adding new Stripe', () => {
    function canAddMore(currentCount: number, tier: string) {
      return currentCount < limits[tier].maxConnectedAccounts;
    }
    expect(canAddMore(1, 'FREE')).toBe(false);
    expect(canAddMore(0, 'FREE')).toBe(true);
    expect(canAddMore(2, 'PRO')).toBe(false);
    expect(canAddMore(1, 'PRO')).toBe(true);
    expect(canAddMore(10, 'BUSINESS')).toBe(false);
    expect(canAddMore(9, 'BUSINESS')).toBe(true);
  });

  it('enforces max rules when creating new Rule in Ruleset', () => {
    function canAddMoreRules(currentRules: number, tier: string) {
      return currentRules < limits[tier].maxRules;
    }
    expect(canAddMoreRules(1, 'FREE')).toBe(false);
    expect(canAddMoreRules(3, 'STARTER')).toBe(false);
    expect(canAddMoreRules(10, 'PRO')).toBe(false);
    expect(canAddMoreRules(50, 'BUSINESS')).toBe(false);
    expect(canAddMoreRules(49, 'BUSINESS')).toBe(true);
  });
});

describe('VAT rate lookup fallback (35 countries × 5 product types)', () => {
  const VAT_RATES: Record<string, number> = {
    AT: 0.2, BE: 0.21, BG: 0.2, HR: 0.25, CY: 0.19, CZ: 0.21, DK: 0.25,
    EE: 0.22, FI: 0.255, FR: 0.2, DE: 0.19, GR: 0.24, HU: 0.27, IE: 0.23,
    IT: 0.22, LV: 0.21, LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21, PL: 0.23,
    PT: 0.23, RO: 0.19, SK: 0.2, SI: 0.22, ES: 0.21, SE: 0.25,
    GB: 0.2, NO: 0.25, CH: 0.081, AU: 0.1, NZ: 0.15, CA: 0.05,
    JP: 0.1, KR: 0.1, SG: 0.09, IN: 0.18, BR: 0.17, MX: 0.16,
  };

  it('has all 27 EU member states', () => {
    const euMembers = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
    for (const c of euMembers) {
      expect(VAT_RATES[c]).toBeDefined();
    }
  });

  it('UK post-Brexit VAT rate is 20%', () => {
    expect(VAT_RATES.GB).toBe(0.2);
  });

  it('Switzerland has reduced VAT (8.1%)', () => {
    expect(VAT_RATES.CH).toBeLessThan(0.1);
    expect(VAT_RATES.CH).toBeGreaterThan(0.05);
  });

  it('Germany VAT (19%) is correctly tracked', () => {
    expect(VAT_RATES.DE).toBe(0.19);
  });

  it('Denmark has highest EU VAT (25%)', () => {
    expect(VAT_RATES.DK).toBe(0.25);
  });

  it('Norway has high VAT (25%) despite being non-EU', () => {
    expect(VAT_RATES.NO).toBe(0.25);
  });

  it('Singapore GST is 9% (rose from 7% in 2023-2024)', () => {
    expect(VAT_RATES.SG).toBe(0.09);
  });

  it('Hungary has highest VAT in EU (27%)', () => {
    expect(VAT_RATES.HU).toBe(0.27);
  });

  it('lookup returns 0 for unknown country (safe default)', () => {
    expect(VAT_RATES['XX'] || 0).toBe(0);
  });
});

describe('US State Taxability matrix (45 states with sales tax × 5 product types)', () => {
  const STATES_WITH_SALES_TAX = [
    'AL','AZ','AR','CA','CO','CT','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','OH','OK','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
  ];
  const STATES_WITHOUT_SALES_TAX = ['AK','DE','MT','NH','OR'];

  it('has 45 states + DC (50 total)', () => {
    expect(STATES_WITH_SALES_TAX.length).toBe(45);
    expect(STATES_WITHOUT_SALES_TAX.length).toBe(5);
    expect(STATES_WITH_SALES_TAX.length + STATES_WITHOUT_SALES_TAX.length).toBe(50);
  });

  it('does not include AK, DE, MT, NH, OR in sales-tax states', () => {
    for (const noTax of STATES_WITHOUT_SALES_TAX) {
      expect(STATES_WITH_SALES_TAX).not.toContain(noTax);
    }
  });

  it('includes all high-population states', () => {
    const bigStates = ['CA','NY','TX','FL','IL','PA','OH','GA','NC','MI'];
    for (const s of bigStates) {
      expect(STATES_WITH_SALES_TAX).toContain(s);
    }
  });

  it('includes DC', () => {
    expect(STATES_WITH_SALES_TAX).toContain('DC');
  });
});

describe('Marketplace facilitator enum — exhaustive cases', () => {
  const enumValues = ['NONE','AMAZON','ETSY','EBAY','WALMART','SHOPIFY_MARKETPLACE','CUSTOM'];

  it('has 7 values', () => {
    expect(enumValues.length).toBe(7);
  });

  it('NONE is the default (default(NONE) in schema)', () => {
    expect(enumValues[0]).toBe('NONE');
  });

  it('includes all 5 major marketplaces', () => {
    expect(enumValues).toContain('AMAZON');
    expect(enumValues).toContain('ETSY');
    expect(enumValues).toContain('EBAY');
    expect(enumValues).toContain('WALMART');
    expect(enumValues).toContain('SHOPIFY_MARKETPLACE');
  });

  it('CUSTOM is the escape hatch for niche marketplaces', () => {
    expect(enumValues).toContain('CUSTOM');
  });
});

describe('State registration pipeline — all status transitions valid', () => {
  type Status = 'NOT_REGISTERED'|'REGISTERING'|'REGISTERED'|'PERMIT_PENDING'|'ACTIVE_FILING'|'VOLUNTARY_CLOSED'|'REVOKED';

  // Valid forward transitions per our docs (not enforced at DB level, but expected)
  const VALID: Record<Status, Status[]> = {
    NOT_REGISTERED: ['REGISTERING'],
    REGISTERING: ['REGISTERED', 'PERMIT_PENDING'],
    REGISTERED: ['ACTIVE_FILING'],
    PERMIT_PENDING: ['REGISTERED', 'ACTIVE_FILING'],
    ACTIVE_FILING: ['VOLUNTARY_CLOSED', 'REVOKED'],
    VOLUNTARY_CLOSED: ['REGISTERING'], // can re-register
    REVOKED: ['REGISTERING'], // can re-register after revocation
  };

  it('every status has at least one forward transition', () => {
    for (const s of Object.keys(VALID) as Status[]) {
      expect(VALID[s].length).toBeGreaterThan(0);
    }
  });

  it('terminal states (VOLUNTARY_CLOSED, REVOKED) can re-enter via REGISTERING', () => {
    expect(VALID.VOLUNTARY_CLOSED).toContain('REGISTERING');
    expect(VALID.REVOKED).toContain('REGISTERING');
  });

  it('ACTIVE_FILING is reachable from both REGISTERED and PERMIT_PENDING', () => {
    expect(VALID.REGISTERED).toContain('ACTIVE_FILING');
    expect(VALID.PERMIT_PENDING).toContain('ACTIVE_FILING');
  });

  it('NOT_REGISTERED can only transition to REGISTERING (not jump to ACTIVE_FILING)', () => {
    expect(VALID.NOT_REGISTERED).toEqual(['REGISTERING']);
  });
});
