import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env validator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses valid environment', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '4001',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      JWT_SECRET: 'a'.repeat(32),
      TOKEN_ENC_KEY: '0'.repeat(64),
      WEB_ORIGIN: 'http://localhost:3000',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_BILLING_WEBHOOK_SECRET: '',
      SHOPIFY_API_SECRET: '',
    });

    const { env } = await import('./env');
    expect(env.PORT).toBe(4001);
    expect(env.JWT_SECRET.length).toBe(32);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
  });

  it('fails on missing DATABASE_URL', async () => {
    Object.assign(process.env, {
      JWT_SECRET: 'a'.repeat(32),
      TOKEN_ENC_KEY: '0'.repeat(64),
      DATABASE_URL: '',
      STRIPE_BILLING_WEBHOOK_SECRET: '',
      SHOPIFY_API_SECRET: '',
    });
    const orig = process.exit;
    process.exit = vi.fn() as any;
    try {
      await import('./env');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.exit = orig;
    }
  });

  it('fails on short JWT_SECRET', async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://u:p@h:5432/d',
      JWT_SECRET: 'short',
      TOKEN_ENC_KEY: '0'.repeat(64),
      STRIPE_BILLING_WEBHOOK_SECRET: '',
      SHOPIFY_API_SECRET: '',
    });
    const orig = process.exit;
    process.exit = vi.fn() as any;
    try {
      await import('./env');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.exit = orig;
    }
  });

  it('fails on invalid TOKEN_ENC_KEY format', async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://u:p@h:5432/d',
      JWT_SECRET: 'a'.repeat(32),
      TOKEN_ENC_KEY: 'not-hex',
      STRIPE_BILLING_WEBHOOK_SECRET: '',
      SHOPIFY_API_SECRET: '',
    });
    const orig = process.exit;
    process.exit = vi.fn() as any;
    try {
      await import('./env');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.exit = orig;
    }
  });
});
