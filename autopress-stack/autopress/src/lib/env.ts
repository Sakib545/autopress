/** Central env access. Never import this from a client component. */
const bool = (v: string | undefined, d = false) =>
  v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
/** Numeric env var constrained to a sane range, so a typo cannot hang a worker. */
const clamped = (v: string | undefined, d: number, min: number, max: number) =>
  Math.min(max, Math.max(min, num(v, d)));

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  nextAuthSecret: process.env.NEXTAUTH_SECRET ?? 'dev-insecure-secret-change-me',

  aiProvider: (process.env.AI_PROVIDER ?? 'mock').toLowerCase(),
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  googleKey: process.env.GOOGLE_AI_API_KEY ?? '',
  modelWriting: process.env.AI_MODEL_WRITING ?? '',
  modelReview: process.env.AI_MODEL_REVIEW ?? '',
  modelCheap: process.env.AI_MODEL_CHEAP ?? '',

  researchProvider: (process.env.RESEARCH_PROVIDER ?? 'mock').toLowerCase(),
  tavilyKey: process.env.TAVILY_API_KEY ?? '',
  serpApiKey: process.env.SERPAPI_API_KEY ?? '',

  imageProvider: (process.env.IMAGE_PROVIDER ?? 'fallback').toLowerCase(),
  imageApiKey: process.env.IMAGE_API_KEY ?? '',
  unsplashKey: process.env.UNSPLASH_ACCESS_KEY ?? '',

  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? 'Signal Review',

  cronSecret: process.env.CRON_SECRET ?? '',
  workerConcurrency: num(process.env.WORKER_CONCURRENCY, 2),
  monthlyBudgetUsd: num(process.env.MONTHLY_AI_BUDGET_USD, 50),

  // MoneyPrinterTurbo — external short-form video service, reached over HTTP only.
  // Every value here is server-side. None of it is ever sent to the browser:
  // the admin screens receive a redacted summary from mptConfigSummary().
  mptEnabled: bool(process.env.MPT_ENABLED, false),
  mptApiUrl: (process.env.MPT_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, ''),
  // MPT_PUBLIC_BASE_URL is the documented name; MPT_PUBLIC_URL is kept working
  // for installs that already set it.
  mptPublicBaseUrl: (process.env.MPT_PUBLIC_BASE_URL ?? process.env.MPT_PUBLIC_URL ?? '').replace(/\/$/, ''),
  mptApiKey: process.env.MPT_API_KEY ?? '',
  mptAutoVideo: bool(process.env.MPT_AUTO_VIDEO, true),
  mptAspect: process.env.MPT_VIDEO_ASPECT ?? '9:16',
  mptSource: process.env.MPT_VIDEO_SOURCE ?? 'pexels',
  mptLanguage: process.env.MPT_VIDEO_LANGUAGE ?? 'en',
  mptVideoCount: clamped(process.env.MPT_VIDEO_COUNT, 1, 1, 5),
  // Target narration length in seconds; drives the script word budget.
  mptVideoDuration: clamped(process.env.MPT_VIDEO_DURATION, 45, 15, 180),
  mptVideoQuality: process.env.MPT_VIDEO_QUALITY ?? '1080p',
  mptPollIntervalMs: clamped(process.env.MPT_POLL_INTERVAL_MS, 10_000, 2_000, 300_000),
  mptMaxPollMinutes: clamped(process.env.MPT_MAX_POLL_MINUTES, 30, 1, 240),
  mptAutoRetry: bool(process.env.MPT_AUTO_RETRY, true),
  mptMaxRetries: clamped(process.env.MPT_MAX_RETRIES, 3, 0, 10),

  gaId: process.env.NEXT_PUBLIC_GA_ID ?? '',
  isProd: process.env.NODE_ENV === 'production',
  showSampleContent: bool(process.env.SHOW_SAMPLE_CONTENT, true),
};

export function hasVideoService() {
  return env.mptEnabled && env.mptApiUrl.length > 0;
}

/**
 * Browser-safe view of the video service configuration.
 *
 * Deliberately omits MPT_API_KEY and returns only whether the endpoint is set
 * plus its origin — never query strings, credentials, or the raw key.
 */
export function mptConfigSummary() {
  let endpoint = '';
  try {
    endpoint = env.mptApiUrl ? new URL(env.mptApiUrl).origin : '';
  } catch {
    endpoint = '';
  }
  return {
    provider: 'moneyprinterturbo' as const,
    enabled: env.mptEnabled,
    endpointConfigured: endpoint.length > 0,
    endpoint,
    publicBaseConfigured: env.mptPublicBaseUrl.length > 0,
    autoVideo: env.mptAutoVideo,
    autoRetry: env.mptAutoRetry,
    maxRetries: env.mptMaxRetries,
    pollIntervalMs: env.mptPollIntervalMs,
    maxPollMinutes: env.mptMaxPollMinutes,
    aspect: env.mptAspect,
    quality: env.mptVideoQuality,
    durationSec: env.mptVideoDuration,
  };
}

export function hasRedis() {
  return env.redisUrl.length > 0;
}
