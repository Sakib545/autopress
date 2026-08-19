import type { LLMProvider, LLMRequest, LLMResult } from '../types';
import { ProviderNotConfiguredError } from '../types';
import { estimateTokens } from '../cost';
import { env } from '../../env';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GoogleProvider implements LLMProvider {
  id = 'google';
  isConfigured() {
    return env.googleKey.length > 0;
  }

  async complete(model: string, req: LLMRequest): Promise<LLMResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('google');
    const started = Date.now();

    // The key travels in a header, not the query string: URLs end up in proxy
    // logs and error messages, and this one is a credential.
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.googleKey },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.6,
          maxOutputTokens: req.maxTokens ?? 4096,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');

    return {
      text,
      provider: this.id,
      model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? estimateTokens(req.prompt),
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
      latencyMs: Date.now() - started,
    };
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('google');
    const res = await fetch(`${BASE}/text-embedding-004:embedContent?key=${env.googleKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
    });
    if (!res.ok) throw new Error(`Google embeddings ${res.status}`);
    const data = (await res.json()) as { embedding?: { values: number[] } };
    return data.embedding?.values ?? [];
  }
}
