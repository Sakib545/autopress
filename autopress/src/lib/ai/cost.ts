/** USD per 1M tokens. Update as vendor pricing changes — surfaced in admin. */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'mock-model': { input: 0, output: 0 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

const DEFAULT_RATE = { input: 1, output: 4 };

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const rate = MODEL_RATES[model] ?? DEFAULT_RATE;
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

/** Rough token estimate used only when a provider does not report usage. */
export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
