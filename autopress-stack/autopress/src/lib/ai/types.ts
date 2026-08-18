export type AiTaskName =
  | 'TOPIC_DISCOVERY'
  | 'TOPIC_SCORING'
  | 'EMBEDDING'
  | 'RESEARCH_SYNTHESIS'
  | 'FACT_CHECK'
  | 'ARTICLE_WRITING'
  | 'ARTICLE_REWRITE'
  | 'QUALITY_REVIEW'
  | 'SEO_METADATA'
  | 'INTERNAL_LINKING'
  | 'IMAGE_PROMPT'
  | 'IMAGE_GENERATION'
  | 'REFRESH_DIFF'
  | 'VIDEO_SCRIPT';

export interface LLMRequest {
  task: AiTaskName;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** Structured context. Real providers ignore it; the mock provider uses it
   *  to synthesise realistic output so the pipeline runs with zero API keys. */
  meta?: Record<string, unknown>;
}

export interface LLMResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LLMProvider {
  id: string;
  isConfigured(): boolean;
  complete(model: string, req: LLMRequest): Promise<LLMResult>;
  embed(text: string): Promise<number[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public provider: string) {
    super(
      `AI provider "${provider}" is selected but no API key is configured. ` +
        `Set the matching key in .env, or set AI_PROVIDER=mock to run offline.`,
    );
    this.name = 'ProviderNotConfiguredError';
  }
}

export class BudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(`Monthly AI budget exceeded: $${spent.toFixed(2)} of $${budget.toFixed(2)}.`);
    this.name = 'BudgetExceededError';
  }
}
