import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

/**
 * Conexión central de Redis compartida entre API y Worker.
 * Listeners `error` y `close` previenen crashes silenciosos.
 */
export const redisConnection = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Requerido por BullMQ
  enableReadyCheck: true,
});

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
