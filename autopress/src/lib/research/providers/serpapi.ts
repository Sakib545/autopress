import type { ResearchProvider, SearchHit, SearchOptions, FetchedPage } from '../types';
import { ResearchNotConfiguredError } from '../types';
import { env } from '../../env';

export class SerpApiProvider implements ResearchProvider {
  id = 'serpapi';
  isConfigured() {
    return env.serpApiKey.length > 0;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    if (!this.isConfigured()) throw new ResearchNotConfiguredError('serpapi');
    const params = new URLSearchParams({
      api_key: env.serpApiKey,
      engine: 'google',
      q: query,
      num: String(opts?.maxResults ?? 8),
      hl: 'en',
    });
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const data = (await res.json()) as {
      organic_results?: { title: string; link: string; snippet?: string; date?: string; position?: number }[];
    };
    return (data.organic_results ?? []).map((r) => ({
      title: r.title,
      url: r.link,
      domain: (() => {
        try {
          return new URL(r.link).hostname.replace(/^www\./, '');
        } catch {
          return 'unknown';
        }
      })(),
      excerpt: r.snippet ?? '',
      publishedAt: r.date,
      score: r.position ? 1 / r.position : undefined,
    }));
  }

  /** SerpAPI returns SERP data only; page extraction is not part of its scope. */
  async fetchPage(): Promise<FetchedPage | null> {
    return null;
  }
}
