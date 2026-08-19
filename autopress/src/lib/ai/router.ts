import type { AiTaskName, LLMProvider } from './types';
import { env } from '../env';
import { MockLLMProvider } from './providers/mock';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';

const providers: Record<string, LLMProvider> = {
  mock: new MockLLMProvider(),
  local: new OpenAIProvider({
    id: 'local',
    baseUrl: () => env.localAiBaseUrl,
    apiKey: () => env.localAiApiKey,
    embeddingModel: () => env.localAiEmbeddingModel,
    requiresApiKey: false,
  }),
  openai: new OpenAIProvider({ requiresApiKey: true }),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
};

const aliases: Record<string, string> = { ollama: 'local', localai: 'local' };
const providerKey = (id?: string) => aliases[(id ?? env.aiProvider).toLowerCase()] ?? (id ?? env.aiProvider).toLowerCase();

/** Which tasks may be skipped when the monthly budget is exhausted. */
export const DISCRETIONARY_TASKS: AiTaskName[] = [
  'TOPIC_DISCOVERY', 'TOPIC_SCORING', 'REFRESH_DIFF', 'IMAGE_PROMPT', 'IMAGE_GENERATION', 'VIDEO_SCRIPT',
];

type Tier = 'cheap' | 'standard' | 'premium';

const TASK_TIER: Record<AiTaskName, Tier> = {
  TOPIC_DISCOVERY: 'cheap', TOPIC_SCORING: 'cheap', EMBEDDING: 'cheap',
  RESEARCH_SYNTHESIS: 'standard', FACT_CHECK: 'standard',
  ARTICLE_WRITING: 'premium', ARTICLE_REWRITE: 'premium', QUALITY_REVIEW: 'standard',
  SEO_METADATA: 'cheap', INTERNAL_LINKING: 'cheap', IMAGE_PROMPT: 'cheap',
  IMAGE_GENERATION: 'cheap', REFRESH_DIFF: 'standard', VIDEO_SCRIPT: 'cheap',
};

const MODELS: Record<string, Record<Tier, string>> = {
  mock: { cheap: 'mock-model', standard: 'mock-model', premium: 'mock-model' },
  local: { cheap: 'qwen2.5:3b', standard: 'qwen2.5:7b', premium: 'qwen2.5:14b' },
  openai: { cheap: 'gpt-4o-mini', standard: 'gpt-4o-mini', premium: 'gpt-4o' },
  anthropic: { cheap: 'claude-haiku-4-5', standard: 'claude-haiku-4-5', premium: 'claude-sonnet-5' },
  google: { cheap: 'gemini-2.5-flash-lite', standard: 'gemini-2.5-flash', premium: 'gemini-2.5-pro' },
};

export function resolveProvider(id?: string): LLMProvider {
  return providers[providerKey(id)] ?? providers.mock;
}

/** Primary provider followed by configured, distinct fallbacks. */
export function resolveProviderChain(primaryId?: string): LLMProvider[] {
  const ids = [providerKey(primaryId), ...env.aiFallbackProviders.map(providerKey)];
  const chain = ids
    .map((id) => providers[id])
    .filter((provider): provider is LLMProvider => Boolean(provider?.isConfigured()))
    .filter((provider, index, all) => all.findIndex((item) => item.id === provider.id) === index);
  return chain.length ? chain : [resolveProvider(primaryId)];
}

export function resolveModel(task: AiTaskName, providerId?: string) {
  const key = providerKey(providerId);
  const tier = TASK_TIER[task] ?? 'standard';
  // Custom model environment variables target the configured primary provider.
  // A fallback must use its own compatible model identifier.
  const isPrimary = key === providerKey();
  if (isPrimary && tier === 'premium' && env.modelWriting) return env.modelWriting;
  if (isPrimary && task === 'QUALITY_REVIEW' && env.modelReview) return env.modelReview;
  if (isPrimary && tier === 'cheap' && env.modelCheap) return env.modelCheap;
  if (isPrimary && tier === 'standard' && env.modelStandard) return env.modelStandard;
  return MODELS[key]?.[tier] ?? MODELS.mock[tier];
}

export function listProviders() {
  return Object.values(providers).map((provider) => ({
    id: provider.id, configured: provider.isConfigured(), models: MODELS[provider.id],
  }));
}
