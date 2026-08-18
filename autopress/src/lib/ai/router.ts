import type { AiTaskName, LLMProvider } from './types';
import { env } from '../env';
import { MockLLMProvider } from './providers/mock';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';

const providers: Record<string, LLMProvider> = {
  mock: new MockLLMProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
};

/** Which tasks may be skipped when the monthly budget is exhausted. */
export const DISCRETIONARY_TASKS: AiTaskName[] = [
  'TOPIC_DISCOVERY',
  'TOPIC_SCORING',
  'REFRESH_DIFF',
  'IMAGE_PROMPT',
  'IMAGE_GENERATION',
  'VIDEO_SCRIPT',
];

type Tier = 'cheap' | 'standard' | 'premium';

const TASK_TIER: Record<AiTaskName, Tier> = {
  TOPIC_DISCOVERY: 'cheap',
  TOPIC_SCORING: 'cheap',
  EMBEDDING: 'cheap',
  RESEARCH_SYNTHESIS: 'standard',
  FACT_CHECK: 'standard',
  ARTICLE_WRITING: 'premium',
  ARTICLE_REWRITE: 'premium',
  QUALITY_REVIEW: 'standard',
  SEO_METADATA: 'cheap',
  INTERNAL_LINKING: 'cheap',
  IMAGE_PROMPT: 'cheap',
  IMAGE_GENERATION: 'cheap',
  REFRESH_DIFF: 'standard',
  VIDEO_SCRIPT: 'cheap',
};

const MODELS: Record<string, Record<Tier, string>> = {
  mock: { cheap: 'mock-model', standard: 'mock-model', premium: 'mock-model' },
  openai: { cheap: 'gpt-4o-mini', standard: 'gpt-4o-mini', premium: 'gpt-4o' },
  anthropic: { cheap: 'claude-haiku-4-5', standard: 'claude-haiku-4-5', premium: 'claude-sonnet-4-6' },
  google: { cheap: 'gemini-2.0-flash', standard: 'gemini-2.0-flash', premium: 'gemini-1.5-pro' },
};

export function resolveProvider(id?: string): LLMProvider {
  const key = (id ?? env.aiProvider).toLowerCase();
  const p = providers[key];
  if (!p) return providers.mock;
  // A selected-but-unconfigured provider must fail loudly, not silently mock.
  return p;
}

export function resolveModel(task: AiTaskName, providerId?: string) {
  const key = (providerId ?? env.aiProvider).toLowerCase();
  const tier = TASK_TIER[task] ?? 'standard';

  if (tier === 'premium' && env.modelWriting) return env.modelWriting;
  if (task === 'QUALITY_REVIEW' && env.modelReview) return env.modelReview;
  if (tier === 'cheap' && env.modelCheap) return env.modelCheap;

  return MODELS[key]?.[tier] ?? MODELS.mock[tier];
}

export function listProviders() {
  return Object.values(providers).map((p) => ({
    id: p.id,
    configured: p.isConfigured(),
    models: MODELS[p.id],
  }));
}
