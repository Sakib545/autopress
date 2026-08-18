/**
 * Turning a MoneyPrinterTurbo task result into a URL we can actually open.
 *
 * MPT reports finished renders as **absolute paths on its own filesystem**, e.g.
 *   /opt/MoneyPrinterTurbo/storage/tasks/<task_id>/final-1.mp4
 * Naively appending that to the API base produces a 404. The service exposes the
 * same files over HTTP at:
 *   GET {base}/api/v1/download/{task_id}/{filename}
 *   GET {base}/api/v1/stream/{task_id}/{filename}
 *
 * This module is pure and dependency-free so the mapping is unit-testable and so
 * nothing here can be influenced by user input at runtime — the base URL is
 * always supplied by the caller from server environment configuration.
 */

/** Filenames MPT produces: final-1.mp4, combined-1.mp4, and friends. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
/** MPT task ids are uuid-like; be permissive but never allow path characters. */
const SAFE_TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type ResolvedVideoUrl =
  | { ok: true; url: string; kind: 'absolute' | 'download' }
  | { ok: false; reason: string };

export function isSafeTaskId(taskId: string): boolean {
  return SAFE_TASK_ID.test(taskId);
}

/**
 * Extracts the `<task_id>/<filename>` pair from whatever MPT returned.
 *
 * Handles absolute filesystem paths, Windows separators, and already-relative
 * paths. Returns null when the shape is unrecognised — callers must then treat
 * the video as unavailable rather than inventing a URL.
 */
export function extractTaskFile(raw: string): { taskId: string; filename: string } | null {
  const normalised = raw.replace(/\\/g, '/').trim();
  if (!normalised) return null;

  const rawSegments = normalised.split('/');
  // A '..' anywhere means the path is not a plain MPT storage path. Rejecting is
  // the only safe answer: silently dropping it would let /tasks/../../etc/passwd
  // resolve to a task id of "etc".
  if (rawSegments.some((s) => s === '..')) return null;

  const segments = rawSegments.filter((s) => s.length > 0 && s !== '.');
  if (segments.length < 2) return null;

  const filename = segments[segments.length - 1];
  if (!SAFE_FILENAME.test(filename)) return null;

  // Prefer the segment following ".../tasks/", which is how MPT lays out storage.
  const tasksIndex = segments.lastIndexOf('tasks');
  const taskId =
    tasksIndex >= 0 && tasksIndex + 1 < segments.length - 1
      ? segments[tasksIndex + 1]
      : segments[segments.length - 2];

  if (!SAFE_TASK_ID.test(taskId)) return null;
  return { taskId, filename };
}

/**
 * Resolves one entry from a completed MPT task into an openable URL.
 *
 * `taskId` is the id we already hold for the row; it is used as a fallback when
 * the returned path does not carry one, and it is validated before use.
 */
export function resolveVideoUrl(
  raw: string,
  opts: { taskId?: string | null; apiBaseUrl: string; publicBaseUrl?: string },
): ResolvedVideoUrl {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false, reason: 'MoneyPrinterTurbo returned an empty video path.' };

  // Already a URL we can hand to a browser.
  if (/^https?:\/\//i.test(value)) {
    try {
      return { ok: true, url: new URL(value).toString(), kind: 'absolute' };
    } catch {
      return { ok: false, reason: `MoneyPrinterTurbo returned a malformed URL: ${value.slice(0, 120)}` };
    }
  }

  const base = (opts.publicBaseUrl || opts.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) {
    return { ok: false, reason: 'No MPT_PUBLIC_BASE_URL or MPT_API_URL is configured to serve the file from.' };
  }

  const parts = extractTaskFile(value);
  const taskId = parts?.taskId ?? (opts.taskId && isSafeTaskId(opts.taskId) ? opts.taskId : null);
  const filename = parts?.filename ?? null;

  if (!taskId || !filename) {
    return {
      ok: false,
      reason:
        `Could not derive a public URL from the path MoneyPrinterTurbo returned ` +
        `("${value.slice(0, 120)}"). Set MPT_PUBLIC_BASE_URL if the files are served from another host.`,
    };
  }

  try {
    const url = new URL(`${base}/api/v1/download/${encodeURIComponent(taskId)}/${encodeURIComponent(filename)}`);
    return { ok: true, url: url.toString(), kind: 'download' };
  } catch {
    return { ok: false, reason: `Configured MPT base URL is not a valid URL: ${base.slice(0, 120)}` };
  }
}

/** First usable URL from a task result, plus why the others were rejected. */
export function resolveFirstVideoUrl(
  raws: string[],
  opts: { taskId?: string | null; apiBaseUrl: string; publicBaseUrl?: string },
): ResolvedVideoUrl {
  if (raws.length === 0) {
    return { ok: false, reason: 'MoneyPrinterTurbo reported completion but returned no video files.' };
  }
  let lastReason = 'No usable video path returned.';
  for (const raw of raws) {
    const resolved = resolveVideoUrl(raw, opts);
    if (resolved.ok) return resolved;
    lastReason = resolved.reason;
  }
  return { ok: false, reason: lastReason };
}
