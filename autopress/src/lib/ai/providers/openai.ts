import type { LLMProvider, LLMRequest, LLMResult } from '../types';
import { ProviderNotConfiguredError } from '../types';
import { estimateTokens } from '../cost';
import { env } from '../../env';

export interface OpenAICompatibleOptions {
  id?: string;
  baseUrl?: () => string;
  apiKey?: () => string;
  embeddingModel?: () => string;
  requiresApiKey?: boolean;
}

/** OpenAI-compatible provider used for OpenAI, Ollama and LocalAI. */
export class OpenAIProvider implements LLMProvider {
  id: string;
  private readonly options: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions = {}) {
    this.options = options;
    this.id = options.id ?? 'openai';
  }

  private baseUrl() {
    return this.options.baseUrl?.() ?? env.openaiBaseUrl;
  }

  private apiKey() {
    return this.options.apiKey?.() ?? env.openaiKey;
  }

  isConfigured() {
    return this.baseUrl().length > 0 && (!this.options.requiresApiKey || this.apiKey().length > 0);
  }

  private headers() {
    const key = this.apiKey();
    return { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) };
  }

  private timeoutMs() {
    // CPU-hosted local models need longer than cloud APIs, especially while
    // Ollama loads the model or handles a long-form generation.
    return this.id === 'local' ? Math.max(env.aiRequestTimeoutMs, 240_000) : env.aiRequestTimeoutMs;
  }

  async complete(model: string, req: LLMRequest): Promise<LLMResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.id);
    const started = Date.now();
    const res = await fetch(this.baseUrl() + '/chat/completions', {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs()),
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.6,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(this.id + ' ' + res.status + ': ' + (await res.text()).slice(0, 300));
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    return {
      text,
      provider: this.id,
      model,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(req.prompt),
      outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
      latencyMs: Date.now() - started,
    };
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.id);
    const res = await fetch(this.baseUrl() + '/embeddings', {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs()),
      body: JSON.stringify({
        model: this.options.embeddingModel?.() ?? 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) throw new Error(this.id + ' embeddings ' + res.status);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }
}
