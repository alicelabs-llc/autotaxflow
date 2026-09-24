import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';

// Helpers reutilizables: construyen raw body + HMAC signature EXACTAMENTE
// como lo harían Stripe/Shopify/WooCommerce/BigCommerce en producción.
// Las verificaciones en los routes son timing-safe, así que el signature
// debe ser byte-perfect.

const SECRET = 'whsec_test_secret_32_bytes_xxxxxxxxxxxx';

function signStripe(rawBody: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function signShopify(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function signWooCommerce(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function signBigCommerce(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('HMAC signature helpers', () => {
  it('Stripe: produces the expected format', () => {
    const sig = signStripe('{"id":"evt_test"}', SECRET);
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('Stripe: changes when secret changes', () => {
    const a = signStripe('payload', SECRET);
    const b = signStripe('payload', SECRET + 'X');
    expect(a).not.toBe(b);
  });

  it('Stripe: changes when payload changes', () => {
    const a = signStripe('{"id":"evt_a"}', SECRET);
    const b = signStripe('{"id":"evt_b"}', SECRET);
    expect(a).not.toBe(b);
  });

  it('Shopify: produces base64 HMAC', () => {
    const sig = signShopify('{"id":1}', SECRET);
    expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('WooCommerce: produces base64 HMAC', () => {
    const sig = signWooCommerce('{"id":"wc_1"}', SECRET);
    expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('BigCommerce: produces hex HMAC', () => {
    const sig = signBigCommerce('{"id":"bc_1"}', SECRET);
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it('timing-safe: equal signatures compare equal', () => {
    const payload = '{"test":true}';
    const sig1 = Buffer.from(signShopify(payload, SECRET), 'base64');
    const sig2 = Buffer.from(signShopify(payload, SECRET), 'base64');
    expect(sig1.length).toBe(sig2.length);
    expect(crypto.timingSafeEqual(sig1, sig2)).toBe(true);
  });

  it('timing-safe: different signatures compare unequal', () => {
    const sig1 = Buffer.from(signShopify('payload_a', SECRET), 'base64');
    const sig2 = Buffer.from(signShopify('payload_b', SECRET), 'base64');
    const len = Math.min(sig1.length, sig2.length);
    expect(crypto.timingSafeEqual(sig1.subarray(0, len), sig2.subarray(0, len))).toBe(false);
  });
});

describe('Stripe webhook signature — SDK compatibility', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.TOKEN_ENC_KEY = 'a'.repeat(64);
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.STRIPE_SECRET_KEY = 'sk_test_12345';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = '';
    process.env.SHOPIFY_API_SECRET = '';
  });

  it('stripe.webhooks.constructEvent accepts a signature generated with signStripe()', async () => {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe('sk_test_12345', { apiVersion: null as any });
    const payload = JSON.stringify({
      id: 'evt_test_001',
      type: 'charge.succeeded',
      data: {
        object: { id: 'ch_test', amount: 5000, currency: 'usd', created: 1700000000 },
      },
    });
    const sig = signStripe(payload, SECRET);
    const event = stripe.webhooks.constructEvent(
      Buffer.from(payload),
      sig,
      SECRET
    );
    expect(event.id).toBe('evt_test_001');
    expect(event.type).toBe('charge.succeeded');
  });

  it('stripe.webhooks.constructEvent rejects tampered signature', async () => {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe('sk_test_12345', { apiVersion: null as any });
    const payload = JSON.stringify({ id: 'evt_test_002', type: 'x' });
    const sig = signStripe(payload, 'wrong_secret');
    expect(() =>
      stripe.webhooks.constructEvent(Buffer.from(payload), sig, SECRET)
    ).toThrow();
  });
});

// Export helpers for other test files
export const HMAC = {
  secret: SECRET,
  signStripe,
  signShopify,
  signWooCommerce,
  signBigCommerce,
};
