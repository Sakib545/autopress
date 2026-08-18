import { Queue, type JobsOptions } from 'bullmq';
import { getRedis } from './redis';
import { hasRedis } from './env';

export const QUEUE_NAMES = [
  'topic.discover',
  'topic.process',
  'research.build',
  'article.draft',
  'article.review',
  'article.rewrite',
  'article.seo',
  'article.link',
  'article.image',
  'publish.run',
  'refresh.scan',
  'refresh.update',
  'links.check',
  'metrics.sync',
  'video.generate',
  'video.poll',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export type JobPayloads = {
  'topic.discover': { count?: number; trigger?: string };
  'topic.process': { topicId: string };
  'research.build': { topicId: string };
  'article.draft': { articleId: string };
  'article.review': { articleId: string; attempt: number };
  'article.rewrite': { articleId: string; attempt: number };
  'article.seo': { articleId: string };
  'article.link': { articleId: string };
  'article.image': { articleId: string };
  'publish.run': { trigger?: string };
  'refresh.scan': { limit?: number };
  'refresh.update': { articleId: string };
  'links.check': { limit?: number };
  'metrics.sync': Record<string, never>;
  'video.generate': { videoId?: string; articleId?: string; trigger?: string };
  'video.poll': { videoId?: string; trigger?: string };
};

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue | null {
  if (!hasRedis()) return null;
  const connection = getRedis();
  if (!connection) return null;
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 15_000 },
          removeOnComplete: { age: 86_400, count: 500 },
          removeOnFail: { age: 604_800 },
        },
      }),
    );
  }
  return queues.get(name)!;
}

/**
 * Enqueues work with a deterministic job id so a cron that fires twice cannot
 * duplicate work. Returns false when Redis is absent, letting the caller decide
 * whether to run the stage inline instead.
 */
export async function enqueue<T extends QueueName>(
  name: T,
  payload: JobPayloads[T],
  opts?: JobsOptions & { idempotencyKey?: string },
): Promise<boolean> {
  const queue = getQueue(name);
  if (!queue) return false;
  const jobId = opts?.idempotencyKey ?? `${name}:${JSON.stringify(payload)}`;
  await queue.add(name, payload, { ...opts, jobId });
  return true;
}

export async function queueCounts() {
  const out: Record<string, { waiting: number; active: number; failed: number; delayed: number }> = {};
  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    if (!q) continue;
    const [waiting, active, failed, delayed] = await Promise.all([
      q.getWaitingCount(), q.getActiveCount(), q.getFailedCount(), q.getDelayedCount(),
    ]);
    out[name] = { waiting, active, failed, delayed };
  }
  return out;
}
