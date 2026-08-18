import type { JobType } from '@prisma/client';
import { enqueue, type QueueName } from './queues';
import { hasRedis } from './env';
import { getSettings } from './settings';
import { prisma } from './db';
import { logError } from './logging';
import {
  runTopicDiscovery, approveTopTopics, runPublishTick, scanForStaleArticles,
  refreshArticle, checkLinks, runArticlePipeline,
  queuedVideos, dispatchVideo, pendingVideoTasks, pollVideo,
} from './pipeline';

export const TRIGGERABLE_JOBS = [
  'topic.discover',
  'publish.run',
  'refresh.scan',
  'links.check',
  'video.generate',
  'video.poll',
] as const;

export type TriggerableJob = (typeof TRIGGERABLE_JOBS)[number];

/**
 * Maps a triggerable job id to the JobType enum recorded on AutomationJob rows,
 * so the admin screen can show the last recorded run for each job. Keep this in
 * sync with TRIGGERABLE_JOBS — the Record type makes a missing entry a compile error.
 */
export const JOB_TYPE_BY_ID: Record<TriggerableJob, JobType> = {
  'topic.discover': 'TOPIC_DISCOVER',
  'publish.run': 'PUBLISH_RUN',
  'refresh.scan': 'REFRESH_SCAN',
  'links.check': 'LINK_CHECK',
  'video.generate': 'VIDEO_GENERATE',
  'video.poll': 'VIDEO_POLL',
};

/** Reverse lookup for rendering a recorded JobType back as its job id. */
export const JOB_ID_BY_TYPE = Object.fromEntries(
  Object.entries(JOB_TYPE_BY_ID).map(([id, type]) => [type, id]),
) as Partial<Record<JobType, TriggerableJob>>;

export function isTriggerableJob(name: string): name is TriggerableJob {
  return (TRIGGERABLE_JOBS as readonly string[]).includes(name);
}

/**
 * Inline implementations of the scheduled jobs. The worker runs these through
 * BullMQ; the cron endpoint and the admin "run now" buttons reuse the exact
 * same code so behaviour cannot drift between the two paths.
 */
const INLINE_RUNNERS: Record<TriggerableJob, () => Promise<Record<string, unknown>>> = {
  'topic.discover': async () => {
    const settings = await getSettings();
    const discovery = await runTopicDiscovery();
    const approved = await approveTopTopics(settings.articlesPerDay);
    for (const topic of approved) {
      const queued = await enqueue('research.build', { topicId: topic.id });
      if (!queued) await runArticlePipeline(topic.id);
    }
    return { ...discovery, approved: approved.length };
  },

  'publish.run': async () => {
    const result = await runPublishTick();
    return { ...result };
  },

  'refresh.scan': async () => {
    const stale = await scanForStaleArticles(20);
    let refreshed = 0;
    for (const item of stale) {
      const queued = await enqueue('refresh.update', { articleId: item.articleId });
      if (!queued) {
        await refreshArticle(item.articleId).catch(() => undefined);
        refreshed++;
      }
    }
    return { stale: stale.length, refreshedInline: refreshed };
  },

  'links.check': async () => checkLinks(50) as Promise<Record<string, unknown>>,

  'video.generate': async () => {
    const queued = await queuedVideos(5);
    let dispatched = 0;
    for (const row of queued) {
      const result = await dispatchVideo(row.id);
      if (result.ok) dispatched++;
    }
    return { queued: queued.length, dispatched };
  },

  'video.poll': async () => {
    const pending = await pendingVideoTasks(20);
    let completed = 0;
    for (const row of pending) {
      const result = await pollVideo(row.id);
      if (result.ok && 'status' in result && result.status === 'COMPLETED') completed++;
    }
    return { polled: pending.length, completed };
  },
};

/**
 * Enqueues when Redis is configured, otherwise executes inline so the whole
 * platform remains usable on a single process during development.
 */
export async function triggerJob(name: TriggerableJob) {
  try {
    if (hasRedis()) {
      const queued = await enqueue(name as QueueName, { trigger: 'manual' } as never, {
        idempotencyKey: `${name}:${Date.now()}`,
      });
      if (queued) return { mode: 'queued' as const, job: name };
    }
    const result = await INLINE_RUNNERS[name]();
    return { mode: 'inline' as const, job: name, result };
  } catch (err) {
    const message = await logError({ scope: `trigger:${name}`, error: err });
    return { mode: 'error' as const, job: name, error: message };
  }
}

/** Counts used by the admin automation screen. */
export async function automationSnapshot() {
  const [pendingTopics, readyArticles, scheduled, failedJobs, lastRuns, lastPerType] = await Promise.all([
    prisma.topic.count({ where: { status: { in: ['NEW', 'APPROVED', 'QUEUED'] } } }),
    prisma.article.count({ where: { status: 'READY' } }),
    prisma.publishingJob.count({ where: { status: 'PENDING' } }),
    prisma.automationJob.count({ where: { status: 'FAILED' } }),
    prisma.automationJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.automationJob.findMany({
      where: { type: { in: Object.values(JOB_TYPE_BY_ID) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['type'],
      select: { type: true, status: true, createdAt: true, durationMs: true },
    }),
  ]);

  const lastByType: Partial<Record<JobType, (typeof lastPerType)[number]>> = {};
  for (const row of lastPerType) lastByType[row.type] = row;

  return { pendingTopics, readyArticles, scheduled, failedJobs, lastRuns, lastByType };
}
