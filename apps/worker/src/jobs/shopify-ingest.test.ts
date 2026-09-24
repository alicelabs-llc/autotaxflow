import { describe, it, expect } from 'vitest';

// Replica exacta de extractState() y extractCountry() de apps/worker/src/jobs/shopify-ingest.ts
interface ShopifyAddress {
  province_code?: string | null;
  country_code?: string | null;
  province?: string | null;
  country?: string | null;
}

interface ShopifyOrder {
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
  customer?: { default_address?: ShopifyAddress | null } | null;
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

describe('Shopify connector — extractState', () => {
  it('prefers billing_address.province_code', () => {
    const order: ShopifyOrder = {
      billing_address: { province_code: 'CA', country_code: 'US' },
      shipping_address: { province_code: 'NV', country_code: 'US' },
    };
    expect(extractState(order)).toBe('CA');
  });

  it('falls back to shipping_address.province_code if billing missing', () => {
    const order: ShopifyOrder = {
      billing_address: null,
      shipping_address: { province_code: 'TX' },
    };
    expect(extractState(order)).toBe('TX');
  });

  it('falls back to billing.province (full name) if no province_code', () => {
    const order: ShopifyOrder = {
      billing_address: { province: 'California' },
      shipping_address: null,
    };
    expect(extractState(order)).toBe('California');
  });

  it('falls back to customer.default_address.province_code', () => {
    const order: ShopifyOrder = {
      billing_address: null,
      shipping_address: null,
      customer: { default_address: { province_code: 'FL' } },
    };
    expect(extractState(order)).toBe('FL');
  });

  it('returns null when no address data', () => {
    expect(extractState({})).toBeNull();
  });
});

describe('Shopify connector — extractCountry', () => {
  it('prefers billing_address.country_code', () => {
    const order: ShopifyOrder = {
      billing_address: { country_code: 'US' },
      shipping_address: { country_code: 'CA' },
    };
    expect(extractCountry(order)).toBe('US');
  });

  it('falls back to shipping country if billing missing', () => {
    const order: ShopifyOrder = {
      billing_address: null,
      shipping_address: { country_code: 'GB' },
    };
    expect(extractCountry(order)).toBe('GB');
  });

  it('falls back to full country name if no ISO code', () => {
    const order: ShopifyOrder = {
      billing_address: { country: 'United States' },
    };
    expect(extractCountry(order)).toBe('United States');
  });

  it('returns null when no address data', () => {
    expect(extractCountry({})).toBeNull();
  });
});

describe('Shopify connector — refund amount math', () => {
  it('sums all transaction amounts in a refund', () => {
    // Same logic as handleRefundCreate — with Number.isFinite guard.
    const sumReduce = (txs: any[]) =>
      txs.reduce((s: number, t: any) => {
        const n = parseFloat(t?.amount || '0');
        return s + (Number.isFinite(n) ? n : 0);
      }, 0);

    const refund1 = { transactions: [{ amount: '50.00' }, { amount: '25.50' }] };
    expect(sumReduce(refund1.transactions)).toBeCloseTo(75.5, 2);

    const refund2 = { transactions: [] };
    expect(sumReduce(refund2.transactions)).toBe(0);

    const refund3 = {};
    expect(sumReduce((refund3 as any).transactions || [])).toBe(0);

    const refund4 = { transactions: [{ amount: 'invalid' }, { amount: '10.00' }] };
    expect(sumReduce(refund4.transactions)).toBeCloseTo(10, 2);
  });
});
