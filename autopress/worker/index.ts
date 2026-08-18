import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { getRedis } from '../src/lib/redis';
import { QUEUE_NAMES, type QueueName } from '../src/lib/queues';
import { env } from '../src/lib/env';
import { logError } from '../src/lib/logging';
import { prisma } from '../src/lib/db';
import { handlers } from './handlers';
import { registerSchedulers } from './schedulers';

/** Queues that must not run in parallel with themselves. */
const CONCURRENCY: Partial<Record<QueueName, number>> = {
  'topic.discover': 1,
  'publish.run': 1,
  'refresh.scan': 1,
  'metrics.sync': 1,
  'article.draft': 2,
  'article.rewrite': 2,
  'refresh.update': 2,
  'research.build': 2,
  'article.review': 3,
  'article.image': 3,
  // MPT is a single external service; do not stampede it.
  'video.generate': 1,
  'video.poll': 1,
};

async function main() {
  const connection = getRedis();
  if (!connection) {
    console.error('[worker] REDIS_URL is not set. The worker cannot start.');
    console.error('[worker] Set REDIS_URL, or run stages from the admin dashboard (inline mode).');
    process.exit(1);
  }

  console.log(`[worker] starting — AI=${env.aiProvider} research=${env.researchProvider} images=${env.imageProvider}`);

  const workers: Worker[] = [];
  for (const name of QUEUE_NAMES) {
    const worker = new Worker(
      name,
      async (job: Job) => {
        const started = Date.now();
        console.log(`[${name}] start ${job.id}`);
        const handler = handlers[name] as (payload: unknown) => Promise<unknown>;
        const result = await handler(job.data);
        console.log(`[${name}] done ${job.id} in ${Date.now() - started}ms`);
        return result;
      },
      { connection, concurrency: CONCURRENCY[name] ?? env.workerConcurrency, lockDuration: 300_000 },
    );

    worker.on('failed', async (job, err) => {
      // One failed article must never stop the rest of the automation.
      await logError({
        scope: name,
        error: err,
        entityType: 'job',
        entityId: job?.id,
        context: { attemptsMade: job?.attemptsMade, data: job?.data },
      });
    });

    workers.push(worker);
  }

  await registerSchedulers();
  console.log(`[worker] ${workers.length} queues online`);

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, draining...`);
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
