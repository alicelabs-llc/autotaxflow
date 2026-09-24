import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Carga .env desde la raíz del monorepo. ts-node-dev arranca desde apps/api/,
// así que necesitamos apuntar explícitamente al .env del repo root.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Validación centralizada de variables de entorno.
 * Lanza en startup si falta algo crítico o un valor es inválido.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  TOKEN_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY must be 32-byte hex (64 chars)'),
  WEB_ORIGIN: z.string().default('https://atf.alicelabs.site'),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_').or(z.literal('')),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').or(z.literal('')),
  STRIPE_CLIENT_ID: z.string().optional().default(''),
  STRIPE_BILLING_WEBHOOK_SECRET: z.string().startsWith('whsec_').or(z.literal('')),
  STRIPE_PRICE_STARTER: z.string().optional().default(''),
  STRIPE_PRICE_PRO: z.string().optional().default(''),
  STRIPE_PRICE_BUSINESS: z.string().optional().default(''),
  STRIPE_PRICE_CPA_PARTNER: z.string().optional().default(''),

  QBO_CLIENT_ID: z.string().optional().default(''),
  QBO_CLIENT_SECRET: z.string().optional().default(''),
  QBO_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  QBO_REDIRECT_URI: z.string().optional().default('http://localhost:3001/api/integrations/qbo/callback'),
  SHOPIFY_API_SECRET: z.string().optional().default(''),
  WOOCOMMERCE_API_SECRET: z.string().optional().default(''),
  BIGCOMMERCE_STORE_HASH: z.string().optional().default(''),
  BIGCOMMERCE_CLIENT_SECRET: z.string().optional().default(''),
  OIDC_ISSUER: z.string().optional().default(''),
  OIDC_CLIENT_ID: z.string().optional().default(''),
  OIDC_CLIENT_SECRET: z.string().optional().default(''),

  AWS_REGION: z.string().optional().default('auto'),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_S3_BUCKET_NAME: z.string().optional().default(''),
  AWS_S3_ENDPOINT: z.string().optional().default(''),

  SENTRY_DSN: z.string().optional().default(''),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
