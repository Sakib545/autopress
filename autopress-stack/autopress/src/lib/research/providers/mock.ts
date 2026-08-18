import type { ResearchProvider, SearchHit, SearchOptions, FetchedPage } from '../types';
import { hash32 } from '../../utils';

const FIXTURE_DOMAINS = [
  { domain: 'docs.example-vendor.com', label: 'Official documentation', credibility: 90 },
  { domain: 'example-vendor.com', label: 'Vendor pricing page', credibility: 80 },
  { domain: 'research.example.org', label: 'Independent research note', credibility: 75 },
  { domain: 'news.example.net', label: 'Industry news roundup', credibility: 60 },
  { domain: 'community.example.io', label: 'Practitioner discussion', credibility: 40 },
];

/**
 * Offline research provider. Returns deterministic fixtures so the research
 * gate, fact table and article pipeline can be exercised without a live API.
 * Everything it returns is explicitly marked synthetic downstream.
 */
export class MockResearchProvider implements ResearchProvider {
  id = 'mock';
  isConfigured() {
    return true;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    const max = opts?.maxResults ?? 5;
    const seed = hash32(query);
    return FIXTURE_DOMAINS.slice(0, max).map((f, i) => ({
      title: `${f.label}: ${query}`,
      url: `https://${f.domain}/${seed}-${i}`,
      domain: f.domain,
      excerpt:
        `Synthetic fixture excerpt for the query "${query}". This text exists so the research pipeline, ` +
        `fact extraction and source attribution can be tested offline. It contains no real information about any product, ` +
        `price or company, and downstream fact verdicts default to UNVERIFIED.`,
      publishedAt: new Date(Date.now() - i * 86_400_000 * 30).toISOString(),
      score: 1 - i * 0.12,
    }));
  }

  async fetchPage(url: string): Promise<FetchedPage | null> {
    return {
      url,
      title: 'Synthetic fixture page',
      text: `Offline fixture body for ${url}. No live content was retrieved.`,
      publishedAt: new Date().toISOString(),
    };
  }
}
