import type { LLMProvider, LLMRequest, LLMResult } from '../types';
import { ProviderNotConfiguredError } from '../types';
import { estimateTokens } from '../cost';
import { env } from '../../env';

export class OpenAIProvider implements LLMProvider {
  id = 'openai';
  isConfigured() {
    return env.openaiKey.length > 0;
  }

  async complete(model: string, req: LLMRequest): Promise<LLMResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('openai');
    const started = Date.now();

    const res = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiKey}` },
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

    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('openai');
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }
}
