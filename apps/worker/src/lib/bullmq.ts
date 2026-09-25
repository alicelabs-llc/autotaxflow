import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from './env';

/**
 * Conexión Redis compartida por todos los workers.
 * Si REDIS_HOST es upstash.io, habilitamos TLS automáticamente (Upstash
 * requiere `rediss://` even on port 6379).
 */

function buildRedisOptions() {
  if (process.env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      ...(process.env.REDIS_URL.startsWith('rediss://')
        ? { tls: {} as Record<string, unknown> }
        : {}),
    };
  }

  const isUpstash = env.REDIS_HOST.includes('upstash.io');
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...(isUpstash ? { tls: {} as Record<string, unknown> } : {}),
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} as Record<string, unknown> } : {}),
  };
}

// Captura unhandled errors para que no crashen el worker.
process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', (err as Error)?.message || String(err));
});

export const redisConnection = new IORedis(buildRedisOptions());

redisConnection.on('error', (err) => {
  console.error('[redis] error:', err.message);
});
redisConnection.on('close', () => console.warn('[redis] closed'));
redisConnection.on('reconnecting', (delay: number) =>
  console.info(`[redis] reconnecting in ${delay}ms`)
);

// El worker solo necesita tener Queue para ADD jobs (lo usa stripe-ingest y el nexus engine).
export const aggregateQueue = new Queue('aggregate_queue', { connection: redisConnection });
export const reportQueue = new Queue('report_queue', { connection: redisConnection });
export const rulesQueue = new Queue('rules_queue', { connection: redisConnection });
