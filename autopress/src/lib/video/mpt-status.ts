import type { MptTaskData, VideoTaskStatus } from './types';

/**
 * MoneyPrinterTurbo reports task state inconsistently across versions —
 * sometimes a numeric code, sometimes a string. Pure so it can be unit-tested
 * against every shape we have seen in the wild.
 *
 * Numeric convention used by MPT: -1 failed, 0 pending, 1 complete, 4 processing.
 */
export function normaliseState(raw: Pick<MptTaskData, 'state'>): VideoTaskStatus['state'] {
  const value = raw?.state;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Some builds serialise the numeric code as a string ("1", "-1"). Falling
    // through to the word branch would report a finished task as PENDING.
    if (/^-?\d+$/.test(trimmed)) return normaliseState({ state: Number(trimmed) });

    const upper = trimmed.toUpperCase();
    if (upper === 'COMPLETE' || upper === 'COMPLETED' || upper === 'SUCCESS') return 'COMPLETE';
    if (upper === 'FAILED' || upper === 'FAILURE' || upper === 'ERROR') return 'FAILED';
    if (upper === 'PROCESSING' || upper === 'RUNNING' || upper === 'STARTED') return 'PROCESSING';
    return 'PENDING';
  }

  if (value === -1) return 'FAILED';
  if (value === 1) return 'COMPLETE';
  if (value === 4) return 'PROCESSING';
  return 'PENDING';
}

/** Every path MPT may have produced, most-preferred first. */
export function collectVideoPaths(raw: MptTaskData): string[] {
  const all = [...(raw?.combined_videos ?? []), ...(raw?.videos ?? [])];
  return all.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

/**
 * Whether a failed dispatch should be retried automatically.
 *
 * Kept pure and separate from the database so the retry policy can be asserted
 * in tests without a Prisma client.
 */
export function shouldAutoRetry(opts: {
  autoRetryEnabled: boolean;
  retryable: boolean;
  attempts: number;
  maxRetries: number;
}): boolean {
  if (!opts.autoRetryEnabled) return false;
  if (!opts.retryable) return false;
  if (opts.maxRetries <= 0) return false;
  return opts.attempts < opts.maxRetries;
}

/**
 * Whether a polling failure should be treated as a passing hiccup rather than a
 * problem with the video.
 *
 * While MoneyPrinterTurbo encodes, its API can stall or briefly refuse
 * connections. The job itself is fine, so a transient failure must not put an
 * error on the row — the max-poll-minutes window is what ends a stuck job.
 */
export function isTransientPollFailure(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? '';
  if (name === 'VideoServiceUnavailableError') return true;
  return /timed out|ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|EAI_AGAIN/i.test(message);
}

/** Whether an in-flight task has outlived MPT_MAX_POLL_MINUTES. */
export function hasPollTimedOut(opts: {
  startedAt: Date | null | undefined;
  now: Date;
  maxPollMinutes: number;
}): boolean {
  if (!opts.startedAt) return false;
  const elapsedMs = opts.now.getTime() - new Date(opts.startedAt).getTime();
  return elapsedMs > opts.maxPollMinutes * 60_000;
}
