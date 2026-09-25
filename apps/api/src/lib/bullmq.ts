import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

/**
 * Conexión central de Redis compartida entre API y Worker.
 * Listeners `error` y `close` previenen crashes silenciosos.
 *
 * Si REDIS_HOST es upstash.io, habilitamos TLS automáticamente (Upstash
 * requiere `rediss://` even on port 6379).
 * Si se setea REDIS_URL completa (redis:// o rediss://), la usamos directo.
 */

function buildRedisOptions() {
  // Si viene REDIS_URL completa, la parseamos
  if (process.env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // ioredis construye la conexión desde la URL
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
    // Upstash requiere TLS. Cualquier host que sea upstash.io lo habilita.
    ...(isUpstash ? { tls: {} as Record<string, unknown> } : {}),
    // O si el usuario lo pide explícitamente via env
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} as Record<string, unknown> } : {}),
  };
}

// Captura unhandled errors antes de crear la conexión — sin esto, IORedis
// podría emitir 'error' antes de que el handler de abajo se registre en
// algunos escenarios edge (race conditions con DNS resolution).
process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err.message);
  // No salir — solo log. El proceso sigue.
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', (err as Error)?.message || String(err));
  // No salir — solo log. El proceso sigue.
});

export const redisConnection = new IORedis(buildRedisOptions());

redisConnection.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

redisConnection.on('close', () => {
  console.warn('[redis] connection closed');
});

redisConnection.on('reconnecting', (delay: number) => {
  console.info(`[redis] reconnecting in ${delay}ms`);
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 10_000, // 10s, 20s, 40s — coincide con JOBS_ARCHITECTURE.md
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

// 5 colas planificadas en docs/JOBS_ARCHITECTURE.md
export const ingestQueue = new Queue('ingest_queue', {
  connection: redisConnection,
  defaultJobOptions,
});

export const syncQueue = new Queue('sync_queue', {
  connection: redisConnection,
  defaultJobOptions,
});

export const aggregateQueue = new Queue('aggregate_queue', {
  connection: redisConnection,
  defaultJobOptions,
});

export const rulesQueue = new Queue('rules_queue', {
  connection: redisConnection,
  defaultJobOptions,
});

export const reportQueue = new Queue('report_queue', {
  connection: redisConnection,
  defaultJobOptions,
});

// QueueEvents para observar estado global desde la API si se quiere
export const ingestQueueEvents = new QueueEvents('ingest_queue', {
  connection: redisConnection,
});
