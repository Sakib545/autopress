import type { JobPayloads, QueueName } from '../src/lib/queues';
import { enqueue } from '../src/lib/queues';
import { prisma } from '../src/lib/db';
import { getSettings } from '../src/lib/settings';
import { claimJob, finishJob, logError } from '../src/lib/logging';
import {
  runTopicDiscovery,
  approveTopTopics,
  buildResearch,
  createArticleForTopic,
  draftArticle,
  rewriteArticle,
  reviewArticle,
  generateSeo,
  buildFinalHtml,
  assignFeaturedImage,
  scheduleArticle,
  runPublishTick,
  scanForStaleArticles,
  refreshArticle,
  checkLinks,
  requestArticleVideo,
  dispatchVideo,
  pollVideo,
  pendingVideoTasks,
  queuedVideos,
} from '../src/lib/pipeline';

type Handler<T extends QueueName> = (payload: JobPayloads[T]) => Promise<unknown>;

/**
 * One handler per queue. Each does a single state transition and enqueues the
 * next stage, so a crash resumes from the database rather than restarting the
 * whole article.
 */
export const handlers: { [K in QueueName]: Handler<K> } = {
  'topic.discover': async (payload) => {
    const key = `topic.discover:${new Date().toISOString().slice(0, 13)}`;
    const job = await claimJob(key, 'TOPIC_DISCOVER', payload);
    if (!job) return { skipped: 'already completed this hour' };
    try {
      const result = await runTopicDiscovery({ count: payload.count });
      const settings = await getSettings();
      const approved = await approveTopTopics(settings.articlesPerDay);
      for (const topic of approved) await enqueue('research.build', { topicId: topic.id });
      await finishJob(job.id, true, { ...result, approved: approved.length });
      return { ...result, approved: approved.length };
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  'topic.process': async ({ topicId }) => {
    await enqueue('research.build', { topicId });
    return { queued: topicId };
  },

  'research.build': async ({ topicId }) => {
    const job = await claimJob(`research.build:${topicId}`, 'RESEARCH_BUILD', { topicId });
    if (!job) return { skipped: true };
    try {
      const result = await buildResearch(topicId);
      if (!result.sufficient) {
        await prisma.topic.update({
          where: { id: topicId },
          data: { status: 'REJECTED', rejectionReason: 'Research insufficient — refusing to write unsupported content.' },
        });
        await finishJob(job.id, true, { ...result, halted: true });
        return { ...result, halted: true };
      }
      const article = await createArticleForTopic(topicId);
      await enqueue('article.draft', { articleId: article.id });
      await finishJob(job.id, true, result);
      return result;
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  'article.draft': async ({ articleId }) => {
    const job = await claimJob(`article.draft:${articleId}`, 'ARTICLE_DRAFT', { articleId });
    if (!job) return { skipped: true };
    try {
      const result = await draftArticle(articleId);
      await enqueue('article.review', { articleId, attempt: 1 });
      await finishJob(job.id, true, result);
      return result;
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  'article.review': async ({ articleId, attempt }) => {
    const job = await claimJob(`article.review:${articleId}:${attempt}`, 'ARTICLE_REVIEW', { articleId, attempt });
    if (!job) return { skipped: true };
    try {
      const review = await reviewArticle(articleId, attempt);
      if (review.action === 'PROCEED') await enqueue('article.seo', { articleId });
      else if (review.action === 'REWRITE') await enqueue('article.rewrite', { articleId, attempt: attempt + 1 });
      await finishJob(job.id, true, { score: review.score, action: review.action });
      return review;
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  'article.rewrite': async ({ articleId, attempt }) => {
    const job = await claimJob(`article.rewrite:${articleId}:${attempt}`, 'ARTICLE_REWRITE', { articleId, attempt });
    if (!job) return { skipped: true };
    try {
      const result = await rewriteArticle(articleId, attempt);
      await enqueue('article.review', { articleId, attempt });
      await finishJob(job.id, true, result);
      return result;
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  'article.seo': async ({ articleId }) => {
    const result = await generateSeo(articleId);
    await enqueue('article.link', { articleId });
    return result;
  },

  'article.link': async ({ articleId }) => {
    const result = await buildFinalHtml(articleId);
    await enqueue('article.image', { articleId });
    return result;
  },

  'article.image': async ({ articleId }) => {
    let result: unknown;
    try {
      result = await assignFeaturedImage(articleId);
    } catch (err) {
      // Image failure must never strand a finished article.
      await logError({ scope: 'article.image', error: err, entityType: 'article', entityId: articleId });
      result = { mediaId: null, fallbackUsed: true };
    }
    await prisma.article.update({ where: { id: articleId }, data: { status: 'READY' } });
    const scheduled = await scheduleArticle(articleId);
    return { ...(result as object), scheduledFor: scheduled.scheduledFor };
  },

  'publish.run': async () => runPublishTick(),

  'refresh.scan': async ({ limit }) => {
    const flagged = await scanForStaleArticles(limit ?? 20);
    for (const item of flagged) await enqueue('refresh.update', { articleId: item.articleId });
    return { flagged: flagged.length };
  },

  'refresh.update': async ({ articleId }) => refreshArticle(articleId),

  'links.check': async ({ limit }) => checkLinks(limit ?? 50),

  /**
   * Dispatches queued videos to MoneyPrinterTurbo. Accepts either a specific
   * videoId (from the publish hook) or no payload (scheduler sweep mode).
   */
  'video.generate': async ({ videoId, articleId }) => {
    let targetId = videoId;

    if (!targetId && articleId) {
      const requested = await requestArticleVideo(articleId);
      if (!requested.created) return { skipped: true, reason: requested.reason };
      targetId = requested.videoId;
    }

    // Sweep mode: pick up anything left QUEUED by a retry or a missed enqueue.
    if (!targetId) {
      const queued = await queuedVideos(5);
      const results = [];
      for (const row of queued) results.push(await dispatchVideo(row.id));
      return { dispatched: results.filter((r) => r.ok).length, attempted: queued.length };
    }

    // The claim key must change per attempt. With a key of just the video id,
    // the AutomationJob row goes COMPLETED after the first successful dispatch
    // and claimJob() then returns null forever — every later Retry and
    // Regenerate silently no-ops in about a millisecond.
    // The claim key must be unique per dispatch, because claimJob() returns null
    // for ever once its AutomationJob row is COMPLETED. Version + attempts is not
    // enough: Retry resets attempts to 0, reproducing the key of the first
    // dispatch, so every retry silently no-opped. updatedAt changes on every
    // write to the row, so a reset always yields a fresh key, while two workers
    // racing on the same unchanged row still collapse onto one claim.
    const claim = await prisma.articleVideo.findUnique({
      where: { id: targetId },
      select: { version: true, updatedAt: true },
    });
    const job = await claimJob(
      `video.generate:${targetId}:v${claim?.version ?? 1}:t${claim?.updatedAt?.getTime() ?? 0}`,
      'VIDEO_GENERATE',
      { videoId: targetId },
    );
    if (!job) return { skipped: true, reason: 'Already dispatched for this attempt.' };
    try {
      const result = await dispatchVideo(targetId);
      await finishJob(job.id, result.ok, result as unknown as Record<string, unknown>);
      // A retryable outage should not mark the BullMQ job failed forever; the
      // row stays QUEUED and the scheduler sweep will retry it.
      return result;
    } catch (err) {
      await finishJob(job.id, false, undefined, (err as Error).message);
      throw err;
    }
  },

  /**
   * Polls in-flight MoneyPrinterTurbo tasks. One row per call so a single
   * stuck task cannot stall the others.
   */
  'video.poll': async ({ videoId }) => {
    if (videoId) return pollVideo(videoId);

    const pending = await pendingVideoTasks(20);
    const results = { polled: 0, completed: 0, failed: 0 };
    for (const row of pending) {
      const result = await pollVideo(row.id);
      results.polled++;
      if (result.ok && 'status' in result && result.status === 'COMPLETED') results.completed++;
      if (!result.ok) results.failed++;
    }
    return results;
  },

  'metrics.sync': async () => {
    // Search Console / GA4 ingestion lands here once credentials are configured.
    // Until then the ArticleMetric table is populated only by manual import.
    return { synced: 0, note: 'No analytics integration configured.' };
  },
};
