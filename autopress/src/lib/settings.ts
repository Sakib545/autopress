import { prisma } from './db';
import { cacheGet, cacheSet, cacheDel } from './redis';
import { env } from './env';

export type SiteConfig = {
  siteName: string;
  siteDescription: string;
  primaryNiche: string;
  secondaryNiches: string[];
  targetCountry: string;
  contentLanguage: string;
  targetAudience: string;
  articleMinWords: number;
  articleMaxWords: number;
  articlesPerDay: number;
  minQualityScore: number;
  maxRewriteAttempts: number;
  publishTimes: string[];
  writingTone: string;
  blockedTopics: string[];
  preferredSources: string[];
  autoPublish: boolean;
  automationEnabled: boolean;
  intentRatios: Record<string, number>;
  duplicateThreshold: number;
  monthlyBudgetUsd: number;
  blockedCategories: string[];
  tagIndexThreshold: number;
  affiliateDisclosure: string;
  maxInternalLinksPer1000Words: number;

  // Short-form video (MoneyPrinterTurbo)
  videoEnabled: boolean;
  videoOnPublish: boolean;
  videoAspect: string;
  videoSource: string;
  videoLanguage: string;
  videoVoice: string;
  videoSubtitles: boolean;
  videoBgMusic: boolean;
  videoCategories: string[];
  videoMaxPerDay: number;
  videoCount: number;
};

export const DEFAULT_SETTINGS: SiteConfig = {
  siteName: env.siteName,
  siteDescription: 'Independent, research-backed reviews and guides to software and AI tools.',
  primaryNiche: 'AI and software tools',
  secondaryNiches: ['productivity software', 'video tools', 'design tools'],
  targetCountry: 'Global',
  contentLanguage: 'en',
  targetAudience: 'Small business owners, creators and independent professionals',
  articleMinWords: 1200,
  articleMaxWords: 3000,
  articlesPerDay: 3,
  minQualityScore: 85,
  maxRewriteAttempts: 2,
  publishTimes: ['09:00', '15:00', '21:00'],
  writingTone: 'Clear, practical, plain-spoken. No hype, no filler.',
  blockedTopics: ['medical advice', 'legal advice', 'investment advice'],
  preferredSources: ['official product documentation', 'vendor pricing pages', 'primary research'],
  autoPublish: false,
  automationEnabled: false,
  intentRatios: { INFORMATIONAL: 40, COMMERCIAL: 30, COMPARISON: 20, NEWS: 10 },
  duplicateThreshold: 0.86,
  monthlyBudgetUsd: env.monthlyBudgetUsd,
  blockedCategories: [],
  tagIndexThreshold: 5,
  affiliateDisclosure:
    'Some links on this page are affiliate links. If you buy through them we may earn a commission at no extra cost to you. This never affects which products we recommend.',
  maxInternalLinksPer1000Words: 4,

  videoEnabled: env.mptEnabled && env.mptAutoVideo,
  videoOnPublish: true,
  videoAspect: env.mptAspect,
  videoSource: env.mptSource,
  videoLanguage: env.mptLanguage,
  videoVoice: '',
  videoSubtitles: true,
  videoBgMusic: true,
  videoCategories: [],
  videoMaxPerDay: 3,
  videoCount: env.mptVideoCount,
};

const CACHE_KEY = 'settings:site';

/** DB setting → env var → hardcoded default. Secrets are never stored here. */
export async function getSettings(): Promise<SiteConfig> {
  const cached = await cacheGet<SiteConfig>(CACHE_KEY);
  if (cached) return cached;

  let merged: SiteConfig = { ...DEFAULT_SETTINGS };
  try {
    const rows = await prisma.siteSetting.findMany({ where: { isSecret: false } });
    for (const row of rows) {
      if (row.key in merged && row.value !== null) {
        (merged as Record<string, unknown>)[row.key] = row.value as unknown;
      }
    }
  } catch {
    // DB not migrated yet (first boot) — defaults keep the app renderable.
  }
  await cacheSet(CACHE_KEY, merged, 60);
  return merged;
}

export async function updateSettings(patch: Partial<SiteConfig>, group = 'general') {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  for (const [key, value] of entries) {
    const type =
      typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? 'NUMBER' : Array.isArray(value) || typeof value === 'object' ? 'JSON' : 'STRING';
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as never, type: type as never, group },
      update: { value: value as never, type: type as never },
    });
  }
  await cacheDel(CACHE_KEY);
  return getSettings();
}

/** Which external integrations are actually usable right now. */
export function integrationStatus() {
  return {
    ai: {
      provider: env.aiProvider,
      configured:
        env.aiProvider === 'mock' ||
        (env.aiProvider === 'openai' && !!env.openaiKey) ||
        (env.aiProvider === 'anthropic' && !!env.anthropicKey) ||
        (env.aiProvider === 'google' && !!env.googleKey),
    },
    research: {
      provider: env.researchProvider,
      configured:
        env.researchProvider === 'mock' ||
        (env.researchProvider === 'tavily' && !!env.tavilyKey) ||
        (env.researchProvider === 'serpapi' && !!env.serpApiKey),
    },
    images: {
      provider: env.imageProvider,
      configured:
        env.imageProvider === 'fallback' ||
        (env.imageProvider === 'stock' && !!env.unsplashKey) ||
        (env.imageProvider === 'ai' && (!!env.openaiKey || !!env.imageApiKey)),
    },
    redis: { provider: 'redis', configured: !!env.redisUrl },
    video: { provider: 'moneyprinterturbo', configured: env.mptEnabled && !!env.mptApiUrl },
    analytics: { provider: 'ga4', configured: !!env.gaId },
  };
}
