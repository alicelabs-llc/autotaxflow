import { Worker } from 'bullmq';
import 'dotenv/config';
import { redisConnection } from './lib/bullmq';
import { env } from './lib/env';
import { processStripeIngest } from './jobs/stripe-ingest';
import { processShopifyIngest } from './jobs/shopify-ingest';
import { processAggregateDaily } from './jobs/aggregate';
import { processReport } from './jobs/report';
import { runNexusEngineForOrg, runNexusEngineAllOrgs } from './jobs/nexus-engine';
import { processQboSyncAccounts, processQboSyncTransactions } from './jobs/qbo-sync';

const commonOpts = { connection: redisConnection, concurrency: 10 };

const ingestWorker = new Worker(
  'ingest_queue',
  async (job) => {
    switch (job.name) {
      case 'stripe.ingestEvent':
        return await processStripeIngest(job.data);
      case 'shopify.ingestEvent':
        return await processShopifyIngest(job.data);
      default:
        console.warn(`[ingest] unknown job ${job.name}`);
    }
  },
  commonOpts
);

const aggregateWorker = new Worker(
  'aggregate_queue',
  async (job) => {
    switch (job.name) {
      case 'aggregate.revenueDaily':
        return await processAggregateDaily(job.data);
      default:
        console.warn(`[aggregate] unknown job ${job.name}`);
    }
  },
  { ...commonOpts, concurrency: 5 }
);

const reportWorker = new Worker(
  'report_queue',
  async (job) => {
    switch (job.name) {
      case 'report.generate':
        return await processReport(job.data);
      default:
        console.warn(`[report] unknown job ${job.name}`);
    }
  },
  { ...commonOpts, concurrency: 2 }
);

const rulesWorker = new Worker(
  'rules_queue',
  async (job) => {
    switch (job.name) {
      case 'rules.evaluateOrg':
        return await runNexusEngineForOrg(job.data.organizationId);
      case 'rules.evaluateAllOrgs':
        return await runNexusEngineAllOrgs();
      default:
        console.warn(`[rules] unknown job ${job.name}`);
    }
  },
  { ...commonOpts, concurrency: 1 } // 1 a la vez — toca NexusFlag con upserts
);

const syncWorker = new Worker(
  'sync_queue',
  async (job) => {
    switch (job.name) {
      case 'sync.qbo.accounts':
        return await processQboSyncAccounts(job.data);
      case 'sync.qbo.transactions':
        return await processQboSyncTransactions(job.data);
      default:
        console.warn(`[sync] unknown job ${job.name}`);
    }
  },
  { ...commonOpts, concurrency: 2 } // QBO API has rate limits, keep concurrency low
);

function attach(name: string, w: Worker) {
  w.on('completed', (job) => console.log(`✅ [${name}] job ${job.id} [${job.name}] done`));
  w.on('failed', (job, err) =>
    console.error(`❌ [${name}] job ${job?.id} [${job?.name}] failed: ${err.message}`)
  );
  w.on('error', (err) => console.error(`[${name}] worker error:`, err.message));
}

attach('ingest', ingestWorker);
attach('aggregate', aggregateWorker);
attach('report', reportWorker);
attach('rules', rulesWorker);
attach('sync', syncWorker);

// Schedule the nexus engine to run hourly for all orgs.
// Idempotent — safe to call multiple times; BullMQ dedupes by repeat key.
async function scheduleNexusEngine() {
  try {
    const { Queue } = await import('bullmq');
    const rulesQueue = new Queue('rules_queue', { connection: redisConnection });
    await rulesQueue.add(
      'rules.evaluateAllOrgs',
      {},
      {
        repeat: { pattern: '0 * * * *', tz: 'UTC' }, // top of every hour
        jobId: 'nexus-engine-hourly', // idempotent repeat key
        removeOnComplete: 100,
      }
    );
    await rulesQueue.close();
    console.log('📅 Nexus engine scheduled (hourly cron)');
  } catch (err) {
    console.warn('[scheduler] could not schedule nexus engine:', (err as Error).message);
  }
}
scheduleNexusEngine();

console.log(
  `🚀 AutoTaxFlow worker up (env=${env.NODE_ENV}). Listening: ingest_queue, aggregate_queue, report_queue, rules_queue`
);

async function shutdown(signal: string) {
  console.info(`[worker] received ${signal}, shutting down...`);
  await Promise.allSettled([
    ingestWorker.close(true),
    aggregateWorker.close(true),
    reportWorker.close(true),
    rulesWorker.close(true),
    syncWorker.close(true),
    redisConnection.quit(),
  ]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
