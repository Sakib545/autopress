import type { ResearchProvider, SearchHit, SearchOptions, FetchedPage } from '../types';
import { ResearchNotConfiguredError } from '../types';
import { env } from '../../env';

export class TavilyProvider implements ResearchProvider {
  id = 'tavily';
  isConfigured() {
    return env.tavilyKey.length > 0;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    if (!this.isConfigured()) throw new ResearchNotConfiguredError('tavily');
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: env.tavilyKey,
        query,
        max_results: opts?.maxResults ?? 6,
        search_depth: 'advanced',
        include_raw_content: false,
        ...(opts?.recencyDays ? { days: opts.recencyDays } : {}),
        ...(opts?.preferredDomains?.length ? { include_domains: opts.preferredDomains } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      results?: { title: string; url: string; content: string; score?: number; published_date?: string }[];
    };
    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      domain: safeDomain(r.url),
      excerpt: r.content,
      publishedAt: r.published_date,
      score: r.score,
    }));
  }

  async fetchPage(url: string): Promise<FetchedPage | null> {
    if (!this.isConfigured()) throw new ResearchNotConfiguredError('tavily');
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.tavilyKey, urls: [url] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { url: string; raw_content: string }[] };
    const first = data.results?.[0];
    return first ? { url: first.url, title: url, text: first.raw_content } : null;
  }
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}
