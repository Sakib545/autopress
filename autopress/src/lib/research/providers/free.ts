import type { FetchedPage, ResearchProvider, SearchHit, SearchOptions } from '../types';

const clean = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const domainFor = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const xmlValue = (block: string, tag: string) => {
  const value = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
  return clean(value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''));
};

function relatedTopics(items: unknown[]): Array<{ FirstURL?: string; Text?: string }> {
  const out: Array<{ FirstURL?: string; Text?: string }> = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { FirstURL?: string; Text?: string; Topics?: unknown[] };
    if (row.FirstURL && row.Text) out.push(row);
    if (Array.isArray(row.Topics)) out.push(...relatedTopics(row.Topics));
  }
  return out;
}

/**
 * Free, keyless research provider for production.
 * It combines DuckDuckGo instant answers, Wikipedia search and Hacker News
 * search. All returned URLs are live public sources; no synthetic fixtures.
 */
export class FreeResearchProvider implements ResearchProvider {
  id = 'free';

  isConfigured() {
    return true;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    const max = Math.max(1, Math.min(opts?.maxResults ?? 5, 10));
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    const add = (hit: Omit<SearchHit, 'domain'>) => {
      const domain = domainFor(hit.url);
      if (!domain || seen.has(hit.url)) return;
      seen.add(hit.url);
      hits.push({ ...hit, domain });
    };

    const tasks = [
      fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (compatible; AutoPressResearch/1.0)',
          Referer: 'https://html.duckduckgo.com/',
        },
        body: new URLSearchParams({ q: query, kl: 'us-en' }).toString(),
        signal: AbortSignal.timeout(12_000),
      }).then(async (res) => {
        if (!res.ok) return;
        const html = await res.text();
        const blocks = html.split(/class=["']result(?:\s|["'])/i).slice(1);
        for (const [i, block] of blocks.entries()) {
          const anchor =
            block.match(/<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["']result__a["'][^>]*>([\s\S]*?)<\/a>/i);
          const snippet = block.match(/<(?:a|div)[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1];
          if (!anchor?.[1] || !anchor[2] || !snippet) continue;
          let url = clean(anchor[1]);
          if (url.startsWith('//')) url = `https:${url}`;
          try {
            const redirect = new URL(url, 'https://html.duckduckgo.com/');
            url = redirect.searchParams.get('uddg') || redirect.toString();
          } catch {
            continue;
          }
          add({
            title: clean(anchor[2]),
            url,
            excerpt: clean(snippet).slice(0, 1200),
            score: Math.max(0.65, 1 - i * 0.06),
          });
        }
      }),
      fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(12_000) },
      ).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          AbstractText?: string;
          AbstractURL?: string;
          Heading?: string;
          RelatedTopics?: unknown[];
        };
        if (data.AbstractURL && data.AbstractText) {
          add({
            title: data.Heading || query,
            url: data.AbstractURL,
            excerpt: clean(data.AbstractText).slice(0, 1200),
            score: 1,
          });
        }
        for (const [i, topic] of relatedTopics(data.RelatedTopics ?? []).entries()) {
          if (!topic.FirstURL || !topic.Text) continue;
          add({
            title: clean(topic.Text).split(' - ')[0] || query,
            url: topic.FirstURL,
            excerpt: clean(topic.Text).slice(0, 1200),
            score: Math.max(0.5, 0.9 - i * 0.05),
          });
        }
      }),
      fetch(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=${max}&mkt=en-US`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoPressResearch/1.0)' },
          signal: AbortSignal.timeout(12_000),
        },
      ).then(async (res) => {
        if (!res.ok) return;
        const xml = await res.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
        for (const [i, item] of items.entries()) {
          const title = xmlValue(item, 'title');
          const url = xmlValue(item, 'link');
          const excerpt = xmlValue(item, 'description');
          if (!title || !url || !excerpt) continue;
          add({
            title,
            url,
            excerpt: excerpt.slice(0, 1200),
            score: Math.max(0.65, 1 - i * 0.06),
          });
        }
      }),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&origin=*&srlimit=${max}`,
        { signal: AbortSignal.timeout(12_000) },
      ).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          query?: { search?: Array<{ title: string; snippet: string; timestamp?: string }> };
        };
        for (const [i, page] of (data.query?.search ?? []).entries()) {
          add({
            title: page.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
            excerpt: clean(page.snippet).slice(0, 1200),
            publishedAt: page.timestamp,
            score: Math.max(0.55, 0.88 - i * 0.05),
          });
        }
      }),
      fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${max}`,
        { signal: AbortSignal.timeout(12_000) },
      ).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          hits?: Array<{ title?: string; url?: string; story_text?: string; created_at?: string; points?: number }>;
        };
        for (const story of data.hits ?? []) {
          if (!story.title || !story.url) continue;
          add({
            title: story.title,
            url: story.url,
            excerpt: clean(story.story_text || story.title).slice(0, 1200),
            publishedAt: story.created_at,
            score: Math.min(0.9, 0.55 + Math.log10((story.points ?? 0) + 1) / 10),
          });
        }
      }),
    ];

    await Promise.allSettled(tasks);
    return hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, max);
  }

  async fetchPage(url: string): Promise<FetchedPage | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AutoPressResearch/1.0 (+https://github.com/Sakib545/autopress)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? domainFor(url));
      const text = clean(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' '),
      ).slice(0, 20_000);
      return { url, title, text };
    } catch {
      return null;
    }
  }
}
