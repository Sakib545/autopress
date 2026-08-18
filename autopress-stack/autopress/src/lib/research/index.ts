import type { ResearchProvider } from './types';
import { env } from '../env';
import { MockResearchProvider } from './providers/mock';
import { TavilyProvider } from './providers/tavily';
import { SerpApiProvider } from './providers/serpapi';

const providers: Record<string, ResearchProvider> = {
  mock: new MockResearchProvider(),
  tavily: new TavilyProvider(),
  serpapi: new SerpApiProvider(),
};

export function getResearchProvider(id?: string): ResearchProvider {
  return providers[(id ?? env.researchProvider).toLowerCase()] ?? providers.mock;
}

export function listResearchProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, configured: p.isConfigured() }));
}

/** Domain trust heuristic used to rank and weight sources. */
export function credibilityFor(domain: string, preferred: string[] = []) {
  const d = domain.toLowerCase();
  if (preferred.some((p) => d.includes(p.toLowerCase()))) return 90;
  if (/\.gov$|\.edu$/.test(d)) return 95;
  if (/^docs\.|^developer\.|^support\./.test(d)) return 88;
  if (/\.org$/.test(d)) return 75;
  if (/reddit|quora|medium|blogspot|wordpress/.test(d)) return 35;
  if (/pinterest|facebook|tiktok/.test(d)) return 15;
  return 60;
}

export * from './types';
