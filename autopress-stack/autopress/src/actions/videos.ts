'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { enqueue } from '@/lib/queues';
import { hasRedis, env } from '@/lib/env';
import {
  requestArticleVideo, dispatchVideo, pollVideo, markVideoPublished,
} from '@/lib/pipeline/article-video';
import { mptClient } from '@/lib/video/mpt-client';
import { logError } from '@/lib/logging';
import type { ActionState } from './topics';

/**
 * Admin actions for short-form video.
 *
 * Security notes that apply to every action here:
 *  - each one re-checks the caller's role; the admin layout gate is not enough.
 *  - ids are validated as cuids before they reach Prisma.
 *  - no action accepts a URL or hostname. The MoneyPrinterTurbo endpoint comes
 *    only from server environment configuration, so a browser cannot steer the
 *    server at an arbitrary host (SSRF).
 */

/** Prisma cuids; rejects path traversal and injection shapes outright. */
const idSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid id.') });

const REVALIDATE = ['/admin/videos'] as const;
function revalidateVideos(articleId?: string) {
  for (const path of REVALIDATE) revalidatePath(path);
  if (articleId) revalidatePath(`/admin/articles/${articleId}`);
}

function disabledMessage() {
  return 'MoneyPrinterTurbo is disabled. Set MPT_ENABLED=true and MPT_API_URL, then restart the app and the worker.';
}

/**
 * Queue a video for an article. Works even when MPT_AUTO_VIDEO=false — manual
 * generation only requires MPT_ENABLED=true — and always goes through the same
 * worker pipeline as the automatic path.
 */
export async function generateVideoAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    if (!env.mptEnabled) return { ok: false, message: disabledMessage() };

    const article = await prisma.article.findUnique({ where: { id }, select: { id: true } });
    if (!article) return { ok: false, message: 'Article not found.' };

    const requested = await requestArticleVideo(id, { force: true });
    if (!requested.created) return { ok: false, message: requested.reason };

    if (hasRedis()) {
      // Without an explicit key the job id is derived from the payload, and
      // BullMQ keeps completed ids for 24h — so a second "Generate video" for
      // the same row was silently dropped while the action reported success.
      await enqueue(
        'video.generate',
        { videoId: requested.videoId },
        { idempotencyKey: `video.generate:${requested.videoId}:manual:${Date.now()}` },
      );
      revalidateVideos(id);
      return { ok: true, message: 'Queued. The worker will build the script and send it to MoneyPrinterTurbo.' };
    }

    // No Redis: the scheduler sweep runs jobs inline. Dispatch directly so the
    // editor gets immediate feedback instead of waiting for the next tick.
    const result = await dispatchVideo(requested.videoId);
    revalidateVideos(id);
    if (!result.ok) return { ok: false, message: result.reason };
    return { ok: true, message: `Sent to MoneyPrinterTurbo (task ${result.taskId}).` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:generateVideo', error: err }) };
  }
}

/**
 * Regenerate from scratch: bumps the row's version, discards the old script and
 * URL, and re-runs the pipeline. Never creates a second row for the article.
 */
export async function regenerateVideoAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    if (!env.mptEnabled) return { ok: false, message: disabledMessage() };

    const video = await prisma.articleVideo.findUnique({
      where: { id },
      select: { articleId: true, aspect: true, status: true },
    });
    if (!video) return { ok: false, message: 'Video not found.' };
    if (video.status === 'GENERATING') {
      return { ok: false, message: 'A render is already in flight for this video. Wait for it to finish, or delete the row.' };
    }

    const requested = await requestArticleVideo(video.articleId, {
      force: true,
      regenerate: true,
      // Pass the row's own aspect: using whatever settings say now would create
      // a second row instead of regenerating this one.
      aspect: video.aspect,
    });
    if (!requested.created) return { ok: false, message: requested.reason };

    if (hasRedis()) {
      await enqueue(
        'video.generate',
        { videoId: requested.videoId },
        { idempotencyKey: `video.generate:${requested.videoId}:regen:${Date.now()}` },
      );
      revalidateVideos(video.articleId);
      return { ok: true, message: 'Regeneration queued — the script will be rebuilt from the current article.' };
    }

    const result = await dispatchVideo(requested.videoId);
    revalidateVideos(video.articleId);
    if (!result.ok) return { ok: false, message: result.reason };
    return { ok: true, message: `Regenerating — task ${result.taskId}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:regenerateVideo', error: err }) };
  }
}

/** Retry a failed video. Resets the row rather than creating a duplicate. */
export async function retryVideoAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    if (!env.mptEnabled) return { ok: false, message: disabledMessage() };

    const video = await prisma.articleVideo.findUnique({ where: { id } });
    if (!video) return { ok: false, message: 'Video not found.' };
    // Retrying an in-flight row nulls its taskId, orphaning a render that is
    // still running on MPT and dispatching a second one.
    if (video.status === 'GENERATING') {
      return { ok: false, message: 'This video is still rendering. Use "Check status", or wait for it to finish.' };
    }
    if (video.status === 'PUBLISHED') {
      return { ok: false, message: 'This video is already published. Use Regenerate if you want a new one.' };
    }

    await prisma.articleVideo.update({
      where: { id },
      data: {
        status: 'QUEUED',
        error: null,
        taskId: null,
        attempts: 0,
        startedAt: null,
        completedAt: null,
        lastPolledAt: null,
      },
    });

    if (hasRedis()) {
      await enqueue('video.generate', { videoId: id }, { idempotencyKey: `video.generate:${id}:${Date.now()}` });
      revalidateVideos(video.articleId);
      return { ok: true, message: 'Retry queued.' };
    }

    const result = await dispatchVideo(id);
    revalidateVideos(video.articleId);
    if (!result.ok) return { ok: false, message: result.reason };
    return { ok: true, message: `Retried — task ${result.taskId}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:retryVideo', error: err }) };
  }
}

/** Force an immediate status check against MoneyPrinterTurbo. */
export async function refreshVideoStatusAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('AUTHOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const result = await pollVideo(id);
    revalidateVideos();
    if (!result.ok) return { ok: false, message: result.reason };
    if ('skipped' in result && result.skipped) return { ok: true, message: `Nothing to poll — status is ${result.status}.` };
    if ('videoUrl' in result && result.videoUrl) return { ok: true, message: 'Video completed.' };
    return { ok: true, message: `Still generating${'progress' in result && result.progress ? ` (${result.progress}%)` : ''}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:refreshVideoStatus', error: err }) };
  }
}

/** Record that a completed video was pushed to a social platform. */
export async function markVideoPublishedAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const platform = String(formData.get('platform') ?? 'manual').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'manual';
    const result = await markVideoPublished(id, platform);
    revalidateVideos();
    if (!result.ok) return { ok: false, message: result.reason };
    return { ok: true, message: `Marked as published to ${platform}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:markVideoPublished', error: err }) };
  }
}

export async function deleteVideoAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const video = await prisma.articleVideo.findUnique({ where: { id }, select: { articleId: true } });
    await prisma.articleVideo.delete({ where: { id } });
    revalidateVideos(video?.articleId);
    return { ok: true, message: 'Video record deleted. A new one can now be generated.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:deleteVideo', error: err }) };
  }
}

/**
 * Connectivity check shown on the admin video screen. Deliberately manual —
 * nothing in the app polls MoneyPrinterTurbo for liveness on a timer.
 */
export async function pingVideoServiceAction(): Promise<ActionState> {
  try {
    await requireRole('AUTHOR');
    if (!env.mptEnabled) return { ok: false, message: disabledMessage() };
    const alive = await mptClient.ping();
    return alive
      ? { ok: true, message: 'MoneyPrinterTurbo responded.' }
      : { ok: false, message: 'No response. Check that MoneyPrinterTurbo is running and MPT_API_URL points at it.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:pingVideoService', error: err }) };
  }
}
