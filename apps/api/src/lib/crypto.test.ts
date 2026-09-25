import { describe, it, expect, beforeAll } from 'vitest';

describe('crypto: AES-256-GCM encrypt/decrypt', () => {
  const OLD_ENV = { ...process.env };
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.TOKEN_ENC_KEY = 'a'.repeat(64); // 32-byte hex
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = '';
    process.env.SHOPIFY_API_SECRET = '';
  });

  it('roundtrips a token', async () => {
    const { encryptToken, decryptToken } = await import('./crypto');
    const plain = 'sk_access_token_xyz_12345';
    const packed = encryptToken(plain);
    expect(packed).not.toContain(plain);
    const decoded = decryptToken(packed);
    expect(decoded).toBe(plain);
  });

  it('fails on tampered ciphertext', async () => {
    const { encryptToken, decryptToken } = await import('./crypto');
    const packed = encryptToken('secret');
    const [iv, tag, ct] = packed.split(':');
    // Flip a byte in ct
    const tampered = [iv, tag, ct.slice(0, -2) + 'ff'].join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('hashPassword and verifyPassword roundtrip', async () => {
    const { hashPassword, verifyPassword } = await import('./crypto');
    const hash = await hashPassword('my-strong-pass');
    expect(hash).not.toBe('my-strong-pass');
    expect(await verifyPassword('my-strong-pass', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
