import type { ResearchProvider } from './types';
import { env } from '../env';
import { MockResearchProvider } from './providers/mock';
import { TavilyProvider } from './providers/tavily';
import { SerpApiProvider } from './providers/serpapi';
import { FreeResearchProvider } from './providers/free';

const providers: Record<string, ResearchProvider> = {
  mock: new MockResearchProvider(),
  free: new FreeResearchProvider(),
  tavily: new TavilyProvider(),
  serpapi: new SerpApiProvider(),
};

export function getResearchProvider(id?: string): ResearchProvider {
  const requested = (id ?? env.researchProvider).toLowerCase();
  // Synthetic fixtures are useful in development, but production should never
  // publish citations to example domains. The free provider needs no API key.
  if (requested === 'mock' && env.isProd) return providers.free;
  return providers[requested] ?? providers.free;
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
