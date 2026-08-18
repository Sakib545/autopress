import { prisma } from '../db';
import { getSettings } from '../settings';
import { env } from '../env';
import { logError, notify } from '../logging';
import { mptClient } from '../video/mpt-client';
import { buildVideoScript } from '../video/video-script';
import { shouldAutoRetry, hasPollTimedOut, isTransientPollFailure } from '../video/mpt-status';
import { resolveVoiceName } from '../video/voices';
import {
  type MptVideoRequest,
  type VideoAspect,
  type VideoSource,
  VideoServiceDisabledError,
  VideoServiceUnavailableError,
} from '../video/types';

/**
 * Short-form video generation.
 *
 * Design rule that governs this whole module: **publishing never waits on
 * video**. Every entry point returns a reason string instead of throwing when
 * video cannot proceed, and the publish path calls these functions after the
 * article is already live. Nothing in here can roll back a publication.
 *
 * Status flow: QUEUED → SCRIPTING → GENERATING → COMPLETED | FAILED
 * (PUBLISHED is set later, once a video is pushed to a social platform.)
 */

const PROVIDER = 'moneyprinterturbo';
/** MPT ships a Chinese default font; Latin narration needs an explicit one. */
const LATIN_FONT = 'BeVietnamPro-Bold.ttf';

function log(message: string, extra?: Record<string, unknown>) {
  const suffix = extra
    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(' ')
    : '';
  console.info(`[MPT] ${message}${suffix}`);
}

type EnqueueResult =
  | { created: false; reason: string; videoId?: string }
  | { created: true; videoId: string };

/** Daily cap check, counted from midnight local time. */
async function videosCreatedToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.articleVideo.count({ where: { createdAt: { gte: start } } });
}

/**
 * Decides whether an article is eligible for a video and creates the row.
 *
 * Duplicate prevention is structural: `@@unique([articleId, aspect])` means a
 * second call for the same article and aspect cannot create a second row, so
 * this is safe to call from a publish hook or a cron that fires twice. A
 * regenerate bumps `version` on the same row rather than inserting another.
 */
export async function requestArticleVideo(
  articleId: string,
  opts: { force?: boolean; regenerate?: boolean; aspect?: string } = {},
): Promise<EnqueueResult> {
  const settings = await getSettings();

  if (!env.mptEnabled) return { created: false, reason: 'MoneyPrinterTurbo is disabled (MPT_ENABLED=false).' };
  // Automatic runs also require MPT_AUTO_VIDEO; a manual force bypasses it.
  if (!env.mptAutoVideo && !opts.force) {
    return { created: false, reason: 'Automatic video generation is off (MPT_AUTO_VIDEO=false).' };
  }
  if (!settings.videoEnabled && !opts.force) return { created: false, reason: 'Auto video generation is off in settings.' };

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true, title: true, status: true, categoryId: true,
      category: { select: { id: true, name: true } },
    },
  });
  if (!article) return { created: false, reason: 'Article not found.' };
  // Only PUBLISHED articles get videos automatically — never DRAFT, REVIEW or SCHEDULED.
  if (article.status !== 'PUBLISHED' && !opts.force) {
    return { created: false, reason: `Article is ${article.status}, not PUBLISHED.` };
  }

  // Category eligibility. Empty list means every category qualifies.
  if (settings.videoCategories.length > 0 && !opts.force) {
    const eligible = settings.videoCategories.some(
      (c) => c === article.categoryId || c.toLowerCase() === (article.category?.name ?? '').toLowerCase(),
    );
    if (!eligible) return { created: false, reason: 'Article category is not enabled for video.' };
  }

  if (!opts.force) {
    const todayCount = await videosCreatedToday();
    if (settings.videoMaxPerDay > 0 && todayCount >= settings.videoMaxPerDay) {
      return { created: false, reason: `Daily video cap reached (${settings.videoMaxPerDay}).` };
    }
  }

  // Admin actions pass the row's own aspect. Without it, changing videoAspect in
  // settings makes Regenerate look up a row that does not exist and insert a
  // second one, leaving the row the user clicked untouched.
  const aspect = (opts.aspect ?? settings.videoAspect) as VideoAspect;

  const existing = await prisma.articleVideo.findUnique({
    where: { articleId_aspect: { articleId, aspect } },
  });

  if (existing) {
    // An edit to a published article must not silently produce a second video.
    const retryable = existing.status === 'FAILED' && existing.attempts < existing.maxAttempts;
    if (!retryable && !opts.force && !opts.regenerate) {
      return { created: false, reason: `A ${aspect} video already exists (${existing.status}).`, videoId: existing.id };
    }

    // Reset in place. Regenerating bumps the version and discards the old script
    // so the narration is rebuilt from the current article text.
    await prisma.articleVideo.update({
      where: { id: existing.id },
      data: {
        status: 'QUEUED',
        error: null,
        taskId: null,
        startedAt: null,
        completedAt: null,
        lastPolledAt: null,
        // Output of the previous render is no longer valid for this row.
        // Leaving it behind showed an "Open video" link on a QUEUED row and
        // carried a stale platform/publishedAt onto the next completion.
        videoUrl: null,
        thumbnailUrl: null,
        durationSec: null,
        platform: null,
        publishedAt: null,
        ...(opts.regenerate
          ? { version: { increment: 1 }, attempts: 0, script: null, scriptTerms: [] }
          : {}),
      },
    });
    log(opts.regenerate ? 'Video queued for regeneration' : 'Video re-queued', {
      article: articleId, video: existing.id,
    });
    return { created: true, videoId: existing.id };
  }

  const video = await prisma.articleVideo.create({
    data: {
      articleId,
      status: 'QUEUED',
      provider: PROVIDER,
      aspect,
      source: settings.videoSource,
      language: settings.videoLanguage,
      voiceName: settings.videoVoice || null,
      subtitles: settings.videoSubtitles,
      bgMusic: settings.videoBgMusic,
      maxAttempts: Math.max(1, env.mptMaxRetries),
    },
  });

  log('Video queued for article', { article: articleId, video: video.id });
  return { created: true, videoId: video.id };
}

/**
 * Builds the narration and dispatches the job to MoneyPrinterTurbo.
 *
 * Runs only inside the worker (or the inline scheduler when Redis is absent) —
 * never in a Next.js request lifecycle, because script generation calls the LLM
 * and MPT dispatch can block for tens of seconds.
 */
export async function dispatchVideo(videoId: string) {
  const video = await prisma.articleVideo.findUnique({
    where: { id: videoId },
    include: {
      article: { select: { id: true, title: true, slug: true, excerpt: true, contentMd: true, contentHtml: true } },
    },
  });
  if (!video) return { ok: false as const, reason: 'Video row not found.' };
  if (!video.article) return { ok: false as const, reason: 'Article missing.' };

  // Idempotency guard — another worker may already have dispatched this.
  if (video.status === 'GENERATING' && video.taskId) {
    return { ok: true as const, taskId: video.taskId, skipped: true };
  }
  if (video.status === 'COMPLETED' || video.status === 'PUBLISHED') {
    return { ok: true as const, taskId: video.taskId ?? '', skipped: true };
  }

  const settings = await getSettings();

  try {
    // --- SCRIPTING -------------------------------------------------------
    await prisma.articleVideo.update({
      where: { id: video.id },
      data: { status: 'SCRIPTING', startedAt: video.startedAt ?? new Date() },
    });
    log('Generating script', { video: video.id, article: video.article.id });

    const script = video.script
      ? {
          script: video.script,
          terms: video.scriptTerms,
          wordCount: video.script.split(/\s+/).length,
          title: video.videoTitle ?? video.article.title,
          description: video.videoDescription ?? '',
          fallback: false,
        }
      : await buildVideoScript(video.article);

    await prisma.articleVideo.update({
      where: { id: video.id },
      data: {
        script: script.script,
        scriptTerms: script.terms,
        videoTitle: script.title.slice(0, 190),
        videoDescription: script.description.slice(0, 2000),
      },
    });

    // --- GENERATING ------------------------------------------------------
    const request: MptVideoRequest = {
      video_subject: video.article.title,
      video_script: script.script,
      video_terms: script.terms,
      video_aspect: video.aspect as VideoAspect,
      video_source: video.source as VideoSource,
      video_concat_mode: 'random',
      video_clip_duration: 5,
      video_count: settings.videoCount,
      video_language: video.language,
      // Never empty: MPT routes an empty voice to Azure and fails the audio
      // stage with "Invalid voice ''".
      voice_name: resolveVoiceName(video.voiceName, video.language),
      voice_volume: 1.0,
      bgm_type: video.bgMusic ? 'random' : 'none',
      bgm_volume: video.bgMusic ? 0.2 : 0,
      subtitle_enabled: video.subtitles,
      subtitle_position: 'bottom',
      font_name: LATIN_FONT,
      font_size: 60,
      stroke_width: 1.5,
    };

    const taskId = await mptClient.createTask(request);

    await prisma.articleVideo.update({
      where: { id: video.id },
      data: {
        taskId,
        status: 'GENERATING',
        provider: PROVIDER,
        attempts: { increment: 1 },
        error: null,
        startedAt: new Date(),
        lastPolledAt: new Date(),
      },
    });

    return { ok: true as const, taskId, wordCount: script.wordCount };
  } catch (err) {
    const retryable = err instanceof VideoServiceUnavailableError;
    const disabled = err instanceof VideoServiceDisabledError;
    const message = await logError({
      scope: 'video.generate',
      error: err,
      jobType: 'VIDEO_GENERATE',
      entityType: 'articleVideo',
      entityId: video.id,
    });

    const attempts = video.attempts + 1;
    // Auto-retry is env-gated. When it is off, or the budget is spent, the row
    // lands in FAILED and waits for a manual retry from the admin.
    const willRetry =
      !disabled &&
      shouldAutoRetry({
        autoRetryEnabled: env.mptAutoRetry,
        retryable,
        attempts,
        maxRetries: Math.min(env.mptMaxRetries, video.maxAttempts),
      });

    await prisma.articleVideo.update({
      where: { id: video.id },
      data: {
        attempts,
        error: message,
        // Keep it QUEUED while retries remain so the sweeper picks it up again.
        status: willRetry ? 'QUEUED' : 'FAILED',
      },
    });

    log('Video failed', { video: video.id, attempts, willRetry });
    return { ok: false as const, reason: message, retryable, willRetry };
  }
}

/**
 * Polls one in-flight task. Called by the video.poll scheduler; each call
 * handles a single row so one stuck task cannot block the others.
 */
export async function pollVideo(videoId: string) {
  const video = await prisma.articleVideo.findUnique({ where: { id: videoId } });
  if (!video) return { ok: false as const, reason: 'Video row not found.' };
  if (!video.taskId) return { ok: false as const, reason: 'No task id to poll.' };
  if (video.status !== 'GENERATING') return { ok: true as const, skipped: true, status: video.status };

  /**
   * Ends the row. `attempts` is bumped here too: a render that fails on MPT's
   * side is a spent attempt, and without it `requestArticleVideo` sees
   * `attempts < maxAttempts` forever and re-queues the job unboundedly.
   */
  const fail = async (reason: string) => {
    await prisma.articleVideo.update({
      where: { id: video.id },
      data: {
        status: 'FAILED',
        error: reason.slice(0, 4000),
        attempts: { increment: 1 },
        lastPolledAt: new Date(),
      },
    });
    log('Video failed', { video: video.id, task: video.taskId });
    return { ok: false as const, reason };
  };

  /**
   * The give-up check has to run whether or not MPT answered. Leaving it only
   * on the success path meant that while MPT was unreachable the row polled
   * every tick forever and never left GENERATING.
   */
  const timedOut = () =>
    hasPollTimedOut({
      startedAt: video.startedAt ?? video.createdAt,
      now: new Date(),
      maxPollMinutes: env.mptMaxPollMinutes,
    });

  const timeoutReason =
    `MoneyPrinterTurbo did not finish task ${video.taskId} within ` +
    `${env.mptMaxPollMinutes} minutes (MPT_MAX_POLL_MINUTES). The task id is kept for debugging; ` +
    `check the MoneyPrinterTurbo logs, then retry.`;

  try {
    log('Polling task', { video: video.id, task: video.taskId });
    const status = await mptClient.getTask(video.taskId);

    if (status.state === 'COMPLETE') {
      // A completed task with no servable URL is a failure we must be honest
      // about: keep the task id and raw paths for debugging, and never store a
      // URL we know cannot be opened.
      if (!status.videoUrl) {
        const reason =
          status.urlError ??
          'MoneyPrinterTurbo completed the task but returned no usable video file.';
        log('Video completed without a usable URL', { video: video.id, task: video.taskId });
        // No completedAt — the row is FAILED, and a "completed" timestamp on it
        // read as success in both admin views.
        return fail(
          status.rawPaths.length
            ? `${reason} Paths reported: ${status.rawPaths.join(', ').slice(0, 500)}`
            : reason,
        );
      }

      await prisma.articleVideo.update({
        where: { id: video.id },
        data: {
          status: 'COMPLETED',
          videoUrl: status.videoUrl,
          completedAt: new Date(),
          lastPolledAt: new Date(),
          error: null,
        },
      });
      log('Video completed', { video: video.id, task: video.taskId });
      await notify({
        level: 'SUCCESS',
        title: 'Short-form video ready',
        message: status.videoUrl,
        entityType: 'articleVideo',
        entityId: video.id,
      });
      return { ok: true as const, status: 'COMPLETED' as const, videoUrl: status.videoUrl };
    }

    if (status.state === 'FAILED') {
      return fail(status.error ?? 'MoneyPrinterTurbo reported failure.');
    }

    // Still running. Give up on tasks that have outlived MPT_MAX_POLL_MINUTES.
    if (timedOut()) {
      log('Video timed out', { video: video.id, task: video.taskId, minutes: env.mptMaxPollMinutes });
      return fail(timeoutReason);
    }

    await prisma.articleVideo.update({ where: { id: video.id }, data: { lastPolledAt: new Date() } });
    return { ok: true as const, status: 'GENERATING' as const, progress: status.progress };
  } catch (err) {
    // A polling failure is not a generation failure. While MPT encodes, its API
    // routinely stalls past our read timeout; recording that on the row makes a
    // healthy job look broken. Transient failures only bump lastPolledAt — the
    // MPT_MAX_POLL_MINUTES window above is what actually ends a stuck job.
    // The deadline applies even when MPT never answered — otherwise a stopped
    // service leaves the row polling in GENERATING for ever.
    if (timedOut()) {
      log('Video timed out while unreachable', { video: video.id, task: video.taskId });
      return fail(timeoutReason);
    }

    if (isTransientPollFailure(err)) {
      log('Poll hiccup, still generating', { video: video.id, task: video.taskId });
      await prisma.articleVideo.update({
        where: { id: video.id },
        data: { lastPolledAt: new Date() },
      });
      return { ok: false as const, reason: 'MoneyPrinterTurbo did not answer in time; will poll again.', retryable: true };
    }

    // A hard error (bad JSON, unknown task) is not transient: end the row rather
    // than leaving it GENERATING with an error nobody acts on.
    const message = await logError({
      scope: 'video.poll',
      error: err,
      jobType: 'VIDEO_POLL',
      entityType: 'articleVideo',
      entityId: video.id,
    });
    return fail(message);
  }
}

/** Rows the poller should visit on this tick, paced by MPT_POLL_INTERVAL_MS. */
export async function pendingVideoTasks(limit = 20) {
  return prisma.articleVideo.findMany({
    where: {
      status: 'GENERATING',
      taskId: { not: null },
      OR: [
        { lastPolledAt: null },
        { lastPolledAt: { lte: new Date(Date.now() - env.mptPollIntervalMs) } },
      ],
    },
    orderBy: { lastPolledAt: 'asc' },
    take: limit,
    select: { id: true },
  });
}

/** Queued rows awaiting dispatch, including retryable failures. */
export async function queuedVideos(limit = 10) {
  // SCRIPTING rows are included so a worker that died mid-script is recovered,
  // but only once they are clearly stale. Without the cutoff the sweep grabs a
  // row while another worker is still inside the LLM call, and both dispatch —
  // two billed renders, and the first task id is overwritten and orphaned.
  const staleScripting = new Date(Date.now() - 10 * 60_000);
  return prisma.articleVideo.findMany({
    where: {
      OR: [
        { status: 'QUEUED' },
        { status: 'SCRIPTING', updatedAt: { lt: staleScripting } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
}

/**
 * Marks a completed video as published to a social platform. The actual
 * distribution call belongs to whatever workflow you connect later (Postiz,
 * YouTube Shorts, TikTok, Reels); this records the outcome.
 */
export async function markVideoPublished(videoId: string, platform: string) {
  const video = await prisma.articleVideo.findUnique({ where: { id: videoId } });
  if (!video) return { ok: false as const, reason: 'Video not found.' };
  if (video.status !== 'COMPLETED') return { ok: false as const, reason: `Video is ${video.status}, not COMPLETED.` };
  if (!video.videoUrl) return { ok: false as const, reason: 'Video has no playable URL to publish.' };

  await prisma.articleVideo.update({
    where: { id: videoId },
    data: { status: 'PUBLISHED', platform, publishedAt: new Date() },
  });
  return { ok: true as const };
}

/** The video row for one article, for the panel on the article detail screen. */
export async function articleVideoFor(articleId: string) {
  return prisma.articleVideo.findFirst({
    where: { articleId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Counts for the admin dashboard. */
export async function videoSnapshot() {
  const [byStatus, today, recent] = await Promise.all([
    prisma.articleVideo.groupBy({ by: ['status'], _count: true }),
    videosCreatedToday(),
    prisma.articleVideo.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { article: { select: { id: true, title: true, slug: true, category: { select: { slug: true } } } } },
    }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

  return {
    queued: count('QUEUED') + count('SCRIPTING'),
    generating: count('GENERATING'),
    completed: count('COMPLETED'),
    failed: count('FAILED'),
    published: count('PUBLISHED'),
    today,
    recent,
  };
}
