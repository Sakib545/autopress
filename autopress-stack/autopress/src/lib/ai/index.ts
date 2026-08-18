import { prisma } from '../db';
import { cacheDel } from '../redis';
import { computeCostUsd } from './cost';
import { resolveModel, resolveProvider, DISCRETIONARY_TASKS } from './router';
import { getBudgetState } from './budget';
import { BudgetExceededError, type LLMRequest, type LLMResult } from './types';
import { safeJson } from '../utils';

export * from './types';
export { resolveModel, resolveProvider, listProviders } from './router';
export { getBudgetState } from './budget';
export { MODEL_RATES } from './cost';

export interface CallOptions extends LLMRequest {
  articleId?: string | null;
  providerId?: string;
  /** Discretionary calls are refused once the monthly budget is spent. */
  essential?: boolean;
}

/**
 * Single entry point for every model call. Enforces the budget, records
 * AIUsage, and never lets a caller forget cost accounting.
 */
export async function callLLM(opts: CallOptions): Promise<LLMResult> {
  const isDiscretionary = !opts.essential && DISCRETIONARY_TASKS.includes(opts.task);
  if (isDiscretionary) {
    const budget = await getBudgetState();
    if (budget.exhausted) throw new BudgetExceededError(budget.spentThisMonth, budget.budget);
  }

  const provider = resolveProvider(opts.providerId);
  const model = resolveModel(opts.task, opts.providerId ?? provider.id);

  let result: LLMResult | null = null;
  let error: unknown = null;
  try {
    result = await provider.complete(model, opts);
  } catch (e) {
    error = e;
  }

  const costUsd = result ? computeCostUsd(model, result.inputTokens, result.outputTokens) : 0;
  await prisma.aIUsage
    .create({
      data: {
        articleId: opts.articleId ?? null,
        task: opts.task,
        provider: provider.id,
        model,
        inputTokens: result?.inputTokens ?? 0,
        outputTokens: result?.outputTokens ?? 0,
        costUsd,
        latencyMs: result?.latencyMs ?? null,
        succeeded: !error,
      },
    })
    .catch(() => undefined);
  await cacheDel('budget:state');

  if (error) throw error;
  return result as LLMResult;
}

/** Convenience wrapper for tasks whose prompts demand JSON output. */
export async function callLLMJson<T>(opts: CallOptions, fallback: T): Promise<{ data: T; raw: LLMResult }> {
  const raw = await callLLM({ ...opts, json: true });
  return { data: safeJson<T>(raw.text, fallback), raw };
}

export async function embedText(text: string, providerId?: string): Promise<number[]> {
  const provider = resolveProvider(providerId);
  try {
    return await provider.embed(text);
  } catch {
    const { MockLLMProvider } = await import('./providers/mock');
    return new MockLLMProvider().embed(text);
  }
}
