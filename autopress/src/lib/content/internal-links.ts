import { prisma } from '../db';
import { hash32 } from '../utils';
import { cosine } from './dedupe';

export type LinkCandidate = {
  articleId: string;
  title: string;
  slug: string;
  categorySlug: string;
  score: number;
  clusterId: string | null;
};

/** Ranks existing published articles by relevance to the new one. */
export async function findLinkCandidates(opts: {
  excludeArticleId: string;
  embedding: number[];
  keywords: string[];
  clusterId?: string | null;
  limit?: number;
}): Promise<LinkCandidate[]> {
  const rows = await prisma.article.findMany({
    where: { status: 'PUBLISHED', id: { not: opts.excludeArticleId } },
    select: {
      id: true, title: true, slug: true, embedding: true, clusterId: true,
      category: { select: { slug: true } },
      keywords: { select: { keyword: { select: { normalizedTerm: true } } } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 300,
  });

  const wanted = new Set(opts.keywords.map((k) => k.toLowerCase()));

  return rows
    .map((r) => {
      const semantic = opts.embedding.length && r.embedding.length ? cosine(opts.embedding, r.embedding) : 0;
      const keywordOverlap = r.keywords.filter((k) => wanted.has(k.keyword.normalizedTerm)).length;
      // Same-cluster articles get a deliberate boost so pillars and members interlink.
      const clusterBonus = opts.clusterId && r.clusterId === opts.clusterId ? 0.25 : 0;
      return {
        articleId: r.id,
        title: r.title,
        slug: r.slug,
        categorySlug: r.category?.slug ?? 'articles',
        clusterId: r.clusterId,
        score: semantic + keywordOverlap * 0.15 + clusterBonus,
      };
    })
    .filter((c) => c.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8);
}

/**
 * Inserts contextual links into HTML. Only links inside paragraphs, only one
 * link per target, never inside an existing anchor or heading, and capped by
 * article length so the body never turns into a link farm.
 */
export function injectInternalLinks(
  html: string,
  candidates: LinkCandidate[],
  opts: { wordCount: number; maxPer1000Words: number; usedAnchors?: Set<string> },
) {
  const maxLinks = Math.max(1, Math.min(candidates.length, Math.floor((opts.wordCount / 1000) * opts.maxPer1000Words)));
  const usedAnchors = opts.usedAnchors ?? new Set<string>();
  const inserted: { articleId: string; anchorText: string; anchorHash: string; href: string }[] = [];

  let out = html;
  for (const candidate of candidates) {
    if (inserted.length >= maxLinks) break;

    const anchor = pickAnchor(candidate.title, usedAnchors);
    if (!anchor) continue;

    const href = `/${candidate.categorySlug}/${candidate.slug}`;
    const pattern = new RegExp(`(<p>(?:(?!</p>)[\\s\\S])*?)\\b(${escapeRe(anchor)})\\b`, 'i');

    let done = false;
    out = out.replace(pattern, (match, prefix: string, term: string) => {
      // Skip if this paragraph fragment already contains an anchor tag.
      if (/<a\b/i.test(prefix)) return match;
      done = true;
      return `${prefix}<a href="${href}" data-internal="true">${term}</a>`;
    });

    if (done) {
      const anchorHash = hash32(anchor.toLowerCase());
      usedAnchors.add(anchor.toLowerCase());
      inserted.push({ articleId: candidate.articleId, anchorText: anchor, anchorHash, href });
    }
  }

  return { html: out, inserted };
}

/** Derives a natural anchor phrase from a title, avoiding repeated anchors. */
function pickAnchor(title: string, used: Set<string>) {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'best', 'top', 'guide', 'how', 'what', 'why', 'your']);
  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !stop.has(w));
  for (let size = 3; size >= 2; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(' ');
      if (!used.has(phrase)) return phrase;
    }
  }
  const single = words.find((w) => w.length > 4 && !used.has(w));
  return single ?? null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
