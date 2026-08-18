import { prisma } from '../db';
import { getSettings } from '../settings';
import { acquireLock } from '../redis';
import { notify, logError } from '../logging';
import { revalidateArticle } from '../revalidate';
import { enqueue } from '../queues';
import { env } from '../env';
import { requestArticleVideo } from './article-video';

/** Next N publish slots derived from the admin's configured daily times. */
export function upcomingSlots(publishTimes: string[], count: number, from = new Date()) {
  const slots: Date[] = [];
  const times = [...publishTimes].sort();
  for (let dayOffset = 0; slots.length < count && dayOffset < 30; dayOffset++) {
    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const d = new Date(from);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h || 9, m || 0, 0, 0);
      if (d > from) slots.push(new Date(d));
      if (slots.length >= count) break;
    }
  }
  return slots;
}

/** Books a ready article into the next free slot. The unique index on
 *  (articleId, scheduledFor) makes a double-fired scheduler a no-op. */
export async function scheduleArticle(articleId: string) {
  const settings = await getSettings();
  const taken = await prisma.publishingJob.findMany({
    where: { status: 'PENDING', scheduledFor: { gte: new Date() } },
    select: { scheduledFor: true },
  });
  const takenSet = new Set(taken.map((t) => t.scheduledFor.toISOString()));

  const slots = upcomingSlots(settings.publishTimes, 60);
  const slot = slots.find((s) => !takenSet.has(s.toISOString())) ?? slots[0];
  if (!slot) throw new Error('No publish slots configured. Set publishTimes in admin settings.');

  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { qualityScore: true } });

  const job = await prisma.publishingJob.upsert({
    where: { articleId_scheduledFor: { articleId, scheduledFor: slot } },
    create: { articleId, scheduledFor: slot, status: 'PENDING', priority: article?.qualityScore ?? 0 },
    update: {},
  });

  await prisma.article.update({ where: { id: articleId }, data: { status: 'SCHEDULED', scheduledFor: slot } });
  return { jobId: job.id, scheduledFor: slot };
}

/**
 * Publishes every due article. Guarded by a Redis lock and per-row status
 * checks so overlapping ticks cannot publish the same article twice.
 */
export async function runPublishTick() {
  const release = await acquireLock('publish', 120_000);
  if (!release) return { skipped: true, published: 0 };

  try {
    const settings = await getSettings();
    if (!settings.autoPublish) return { skipped: true, published: 0, reason: 'autoPublish is off' };

    const due = await prisma.publishingJob.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
      orderBy: [{ scheduledFor: 'asc' }, { priority: 'desc' }],
      take: 20,
    });

    let published = 0;
    for (const job of due) {
      if (!job.articleId) {
        await prisma.publishingJob.update({ where: { id: job.id }, data: { status: 'SKIPPED' } });
        continue;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const article = await tx.article.findUnique({
            where: { id: job.articleId as string },
            select: { id: true, status: true, slug: true, title: true, qualityScore: true, category: { select: { slug: true } } },
          });
          if (!article) throw new Error('Article missing');
          // Idempotency guard: only SCHEDULED or READY articles may go live.
          if (article.status !== 'SCHEDULED' && article.status !== 'READY') return null;
          if (article.qualityScore < settings.minQualityScore) throw new Error(`Quality ${article.qualityScore} below minimum ${settings.minQualityScore}`);

          await tx.article.update({
            where: { id: article.id },
            data: { status: 'PUBLISHED', publishedAt: new Date(), updatedContentAt: new Date() },
          });
          await tx.publishingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', publishedAt: new Date() } });
          if (job.topicId) await tx.topic.update({ where: { id: job.topicId }, data: { status: 'PUBLISHED' } });
          return article;
        });

        if (result) {
          published++;
          await revalidateArticle(result.category?.slug ?? 'articles', result.slug);
          await notify({ level: 'SUCCESS', title: `Published: ${result.title}`, entityType: 'article', entityId: result.id });
          // Fire-and-forget: the article is already live. A video failure here
          // must never roll back or delay publication.
          await triggerVideoForPublishedArticle(result.id);
        }
      } catch (err) {
        const message = await logError({ scope: 'publish.run', error: err, jobType: 'PUBLISH_RUN', entityType: 'article', entityId: job.articleId });
        const retryCount = job.retryCount + 1;
        await prisma.publishingJob.update({
          where: { id: job.id },
          data: {
            retryCount,
            lastError: message,
            status: retryCount >= job.maxRetries ? 'FAILED' : 'PENDING',
            scheduledFor: retryCount >= job.maxRetries ? job.scheduledFor : new Date(Date.now() + 15 * 60_000),
          },
        });
        if (retryCount >= job.maxRetries) {
          await prisma.article.update({ where: { id: job.articleId }, data: { status: 'FAILED', failureReason: message } }).catch(() => undefined);
        }
      }
    }
    return { skipped: false, published, due: due.length };
  } finally {
    await release();
  }
}


/**
 * Post-publish side effect. Deliberately swallows every error: the article is
 * already live and committed, so nothing this function does may surface as a
 * publish failure. Problems are logged and the video row is retried later.
 */
export async function triggerVideoForPublishedArticle(articleId: string) {
  try {
    // Cheapest possible exit when the integration is off. With MPT_ENABLED=false
    // this function does nothing at all and logs nothing — no settings query, no
    // database write, no network call.
    if (!env.mptEnabled || !env.mptAutoVideo) return { skipped: true as const };

    const settings = await getSettings();
    if (!settings.videoEnabled || !settings.videoOnPublish) return { skipped: true as const };

    const result = await requestArticleVideo(articleId);
    if (!result.created) return { skipped: true as const, reason: result.reason };

    console.info(`[MPT] Video queued for article article=${articleId} video=${result.videoId}`);

    // Queue when Redis exists; otherwise the video.generate scheduler picks it
    // up. We never dispatch inline here — that would block the publish tick on
    // an external HTTP call.
    await enqueue('video.generate', { videoId: result.videoId });
    return { skipped: false as const, videoId: result.videoId };
  } catch (err) {
    await logError({
      scope: 'publish.video-hook',
      error: err,
      entityType: 'article',
      entityId: articleId,
    }).catch(() => undefined);
    return { skipped: true as const, reason: 'Video hook failed; article is unaffected.' };
  }
}
