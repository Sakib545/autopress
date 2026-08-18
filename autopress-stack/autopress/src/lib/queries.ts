import { prisma } from './db';
import { env } from './env';
import type { Prisma } from '@prisma/client';

/** Sample seed rows are hidden in production unless explicitly allowed. */
export function publicWhere(extra: Prisma.ArticleWhereInput = {}): Prisma.ArticleWhereInput {
  const base: Prisma.ArticleWhereInput = { status: 'PUBLISHED', publishedAt: { lte: new Date() } };
  if (env.isProd && !env.showSampleContent) base.isSample = false;
  return { ...base, ...extra };
}

export const cardSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  readingTime: true,
  publishedAt: true,
  sponsorship: true,
  category: { select: { name: true, slug: true } },
  featuredMedia: { select: { url: true, altText: true } },
} satisfies Prisma.ArticleSelect;

export type CardArticleRow = Prisma.ArticleGetPayload<{ select: typeof cardSelect }>;

export async function latestArticles(take = 9, skip = 0) {
  return prisma.article.findMany({
    where: publicWhere(),
    orderBy: { publishedAt: 'desc' },
    take, skip,
    select: cardSelect,
  });
}

export async function articlesByIntent(contentTypes: string[], take = 4) {
  return prisma.article.findMany({
    where: publicWhere({ contentType: { in: contentTypes as never } }),
    orderBy: { publishedAt: 'desc' },
    take,
    select: cardSelect,
  });
}

export async function trendingArticles(take = 5) {
  return prisma.article.findMany({
    where: publicWhere({ publishedAt: { gte: new Date(Date.now() - 45 * 86_400_000) } }),
    orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
    take,
    select: cardSelect,
  });
}

export async function editorsPicks(take = 3) {
  const pinned = await prisma.article.findMany({
    where: publicWhere({ isPinned: true }),
    orderBy: { publishedAt: 'desc' },
    take,
    select: cardSelect,
  });
  if (pinned.length >= take) return pinned;
  const filler = await prisma.article.findMany({
    where: publicWhere({ isPinned: false, qualityScore: { gte: 80 } }),
    orderBy: [{ qualityScore: 'desc' }, { publishedAt: 'desc' }],
    take: take - pinned.length,
    select: cardSelect,
  });
  return [...pinned, ...filler];
}

/** Related content: same cluster first, then same category. */
export async function relatedArticles(articleId: string, clusterId: string | null, categoryId: string | null, take = 3) {
  const results: CardArticleRow[] = [];
  if (clusterId) {
    results.push(...await prisma.article.findMany({
      where: publicWhere({ clusterId, id: { not: articleId } }),
      orderBy: { publishedAt: 'desc' }, take, select: cardSelect,
    }));
  }
  if (results.length < take && categoryId) {
    results.push(...await prisma.article.findMany({
      where: publicWhere({ categoryId, id: { not: articleId }, NOT: { id: { in: results.map((r) => r.id) } } }),
      orderBy: { publishedAt: 'desc' }, take: take - results.length, select: cardSelect,
    }));
  }
  if (results.length < take) {
    results.push(...await prisma.article.findMany({
      where: publicWhere({ id: { not: articleId }, NOT: { id: { in: results.map((r) => r.id) } } }),
      orderBy: { publishedAt: 'desc' }, take: take - results.length, select: cardSelect,
    }));
  }
  return results;
}

export async function adjacentArticles(publishedAt: Date | null) {
  if (!publishedAt) return { prev: null, next: null };
  const [prev, next] = await Promise.all([
    prisma.article.findFirst({ where: publicWhere({ publishedAt: { lt: publishedAt } }), orderBy: { publishedAt: 'desc' }, select: cardSelect }),
    prisma.article.findFirst({ where: publicWhere({ publishedAt: { gt: publishedAt } }), orderBy: { publishedAt: 'asc' }, select: cardSelect }),
  ]);
  return { prev, next };
}

/**
 * Site search across titles, excerpts, body, categories, tags and keywords.
 * Uses case-insensitive contains plus a token-overlap rank, which tolerates
 * word-order differences and minor noise without extra infrastructure.
 */
export async function searchArticles(query: string, take = 30) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2).slice(0, 6);
  if (!tokens.length) return [];

  const rows = await prisma.article.findMany({
    where: publicWhere({
      OR: tokens.flatMap((t) => [
        { title: { contains: t, mode: 'insensitive' as const } },
        { excerpt: { contains: t, mode: 'insensitive' as const } },
        { contentMd: { contains: t, mode: 'insensitive' as const } },
        { category: { name: { contains: t, mode: 'insensitive' as const } } },
        { tags: { some: { tag: { name: { contains: t, mode: 'insensitive' as const } } } } },
        { keywords: { some: { keyword: { term: { contains: t, mode: 'insensitive' as const } } } } },
      ]),
    }),
    take: 100,
    select: { ...cardSelect, contentMd: true },
  });

  return rows
    .map((row) => {
      const haystackTitle = row.title.toLowerCase();
      const haystackBody = `${row.excerpt ?? ''} ${row.contentMd ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (haystackTitle.includes(t)) score += 10;
        if (haystackBody.includes(t)) score += 1;
      }
      const { contentMd: _drop, ...rest } = row;
      return { ...rest, score };
    })
    .sort((a, b) => b.score - a.score || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, take);
}
