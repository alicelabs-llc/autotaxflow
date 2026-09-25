import 'dotenv/config';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  // 32-byte hex key for AES-256-GCM decryption of QBO OAuth tokens
  TOKEN_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY must be 32-byte hex (64 chars)'),
  QBO_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  // Resend API key. Si no está presente, los emails se loguean pero no se envían.
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().email().default('alerts@alicelabs.site'),
  EMAIL_FROM_NAME: z.string().default('AutoTaxFlow Alerts'),
  APP_BASE_URL: z.string().url().default('https://atf.alicelabs.site'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Worker: invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
