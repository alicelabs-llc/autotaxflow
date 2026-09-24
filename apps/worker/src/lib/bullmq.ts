import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from './env';

/**
 * Conexión Redis compartida por todos los workers.
 */
export const redisConnection = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

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
