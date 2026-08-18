import { env, mptConfigSummary } from '../env';
import { normaliseState, collectVideoPaths } from './mpt-status';
import { resolveFirstVideoUrl, isSafeTaskId } from './mpt-url';
import {
  type MptEnvelope,
  type MptCreateTaskData,
  type MptTaskData,
  type MptVideoRequest,
  type VideoServiceClient,
  type VideoTaskStatus,
  VideoServiceDisabledError,
  VideoServiceUnavailableError,
} from './types';

/**
 * The single HTTP client for MoneyPrinterTurbo.
 *
 * Nothing else in the application may call MPT directly. Every failure mode is
 * converted into a typed error so callers can distinguish "service is down,
 * retry later" (VideoServiceUnavailableError) from "the request itself was
 * wrong" (plain Error), and the publishing pipeline can keep going either way.
 *
 * SSRF note: the base URL comes exclusively from server environment config.
 * No caller can pass an endpoint, and task ids are validated before they are
 * interpolated into a path.
 */

const CREATE_TIMEOUT_MS = 30_000;
// MoneyPrinterTurbo runs its render in a Python thread inside the same process
// that serves the API, so while a video is encoding the status endpoint can take
// tens of seconds to answer. A tight read timeout here reads as an outage and
// puts a scary error on a job that is in fact progressing normally.
const READ_TIMEOUT_MS = 45_000;

/** Structured, secret-free logging. Never receives the API key. */
function log(message: string, extra?: Record<string, unknown>) {
  const suffix = extra
    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(' ')
    : '';
  console.info(`[MPT] ${message}${suffix}`);
}

type RequestInitJson = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

async function request<T>(path: string, init: RequestInitJson = {}, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
  if (!env.mptEnabled) throw new VideoServiceDisabledError();
  if (!env.mptApiUrl) throw new VideoServiceDisabledError();

  const url = `${env.mptApiUrl.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(env.mptApiKey ? { Authorization: `Bearer ${env.mptApiKey}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    // Read the body inside the same abort window. Reading it after
    // clearTimeout() left a stalled response hanging on undici's 5-minute body
    // timeout, holding a worker slot and throwing an untyped error.
    text = await response.text();
  } catch (err) {
    const reason = (err as Error).name === 'AbortError'
      ? `timed out after ${timeoutMs}ms`
      : (err as Error).message;
    throw new VideoServiceUnavailableError(`${url} — ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 4xx is a bad request from us; 5xx means the service is unhealthy.
    if (response.status >= 500) {
      throw new VideoServiceUnavailableError(`${url} returned ${response.status}`);
    }
    throw new Error(`MoneyPrinterTurbo rejected the request (${response.status}): ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MoneyPrinterTurbo returned non-JSON from ${path}: ${text.slice(0, 200)}`);
  }
}

class MoneyPrinterTurboClient implements VideoServiceClient {
  isConfigured() {
    return env.mptEnabled && env.mptApiUrl.length > 0;
  }

  /** POST /api/v1/videos → task_id */
  async createTask(req: MptVideoRequest): Promise<string> {
    if (!req.video_script?.trim()) {
      throw new Error('Refusing to dispatch an empty narration script to MoneyPrinterTurbo.');
    }
    // MoneyPrinterTurbo does not default an empty voice: it hands "" to Azure,
    // which fails with `Invalid voice ''` and kills the task at the audio stage.
    if (!req.voice_name?.trim()) {
      throw new Error(
        'Refusing to dispatch without a voice name — MoneyPrinterTurbo would fail at the audio stage.',
      );
    }

    const body = await request<MptEnvelope<MptCreateTaskData>>(
      '/api/v1/videos',
      { method: 'POST', body: JSON.stringify(req) },
      CREATE_TIMEOUT_MS,
    );

    const taskId = body?.data?.task_id;
    if (!taskId) {
      throw new Error(`MoneyPrinterTurbo did not return a task_id: ${JSON.stringify(body).slice(0, 200)}`);
    }
    if (!isSafeTaskId(taskId)) {
      throw new Error(`MoneyPrinterTurbo returned an unusable task_id: ${String(taskId).slice(0, 80)}`);
    }

    log('Task created', { task: taskId, aspect: req.video_aspect });
    return taskId;
  }

  /** GET /api/v1/tasks/{task_id} */
  async getTask(taskId: string): Promise<VideoTaskStatus> {
    if (!isSafeTaskId(taskId)) {
      throw new Error(`Invalid MoneyPrinterTurbo task id: ${String(taskId).slice(0, 80)}`);
    }

    const body = await request<MptEnvelope<MptTaskData>>(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
    const data = body?.data ?? ({} as MptTaskData);
    const state = normaliseState(data);
    const paths = collectVideoPaths(data);

    let videoUrl: string | null = null;
    let urlError: string | undefined;

    if (state === 'COMPLETE') {
      const resolved = resolveFirstVideoUrl(paths, {
        taskId,
        apiBaseUrl: env.mptApiUrl,
        publicBaseUrl: env.mptPublicBaseUrl,
      });
      if (resolved.ok) videoUrl = resolved.url;
      else urlError = resolved.reason;
    }

    return {
      state,
      progress: typeof data.progress === 'number' ? data.progress : state === 'COMPLETE' ? 100 : 0,
      videoUrl,
      rawPaths: paths,
      urlError,
      error: data.error ?? (state === 'FAILED' ? data.message : undefined),
    };
  }

  /**
   * Cheap liveness probe used by the admin "Check connection" button only.
   * Never called on a timer — polling MPT is the poller's job.
   */
  async ping(): Promise<boolean> {
    try {
      await request('/api/v1/tasks?page=1&page_size=1', {}, 5_000);
      return true;
    } catch (err) {
      if (err instanceof VideoServiceDisabledError) return false;
      if (err instanceof VideoServiceUnavailableError) return false;
      // A 4xx means the service answered, which is all ping needs to know.
      return true;
    }
  }
}

export const mptClient: VideoServiceClient = new MoneyPrinterTurboClient();

/** Redacted configuration for the admin screens. Contains no secrets. */
export function videoServiceStatus() {
  const summary = mptConfigSummary();
  return {
    ...summary,
    // Retained for existing callers.
    configured: summary.enabled && summary.endpointConfigured,
    baseUrl: summary.endpoint || '(not set)',
  };
}
