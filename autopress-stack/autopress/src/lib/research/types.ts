export interface SearchHit {
  title: string;
  url: string;
  domain: string;
  excerpt: string;
  publishedAt?: string;
  score?: number;
}

export interface SearchOptions {
  maxResults?: number;
  preferredDomains?: string[];
  recencyDays?: number;
}

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
}

export interface ResearchProvider {
  id: string;
  isConfigured(): boolean;
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>;
  fetchPage(url: string): Promise<FetchedPage | null>;
}

export class ResearchNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `Research provider "${provider}" is selected but its API key is missing. ` +
        `Set the key in .env, or set RESEARCH_PROVIDER=mock to run offline with fixtures.`,
    );
    this.name = 'ResearchNotConfiguredError';
  }
}
