import type { LLMProvider, LLMRequest, LLMResult } from '../types';
import { ProviderNotConfiguredError } from '../types';
import { estimateTokens } from '../cost';
import { env } from '../../env';
import { MockLLMProvider } from './mock';

export class AnthropicProvider implements LLMProvider {
  id = 'anthropic';
  private fallbackEmbedder = new MockLLMProvider();

  isConfigured() {
    return env.anthropicKey.length > 0;
  }

  async complete(model: string, req: LLMRequest): Promise<LLMResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('anthropic');
    const started = Date.now();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.6,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = (data.content ?? [])
      .map((b) => (b.type === 'text' ? b.text ?? '' : ''))
      .filter(Boolean)
      .join('\n');

    return {
      text,
      provider: this.id,
      model,
      inputTokens: data.usage?.input_tokens ?? estimateTokens(req.prompt),
      outputTokens: data.usage?.output_tokens ?? estimateTokens(text),
      latencyMs: Date.now() - started,
    };
  }

  /** Anthropic has no first-party embeddings endpoint; fall back to the
   *  deterministic local embedder so dedupe still works end to end. */
  async embed(text: string): Promise<number[]> {
    return this.fallbackEmbedder.embed(text);
  }
}
