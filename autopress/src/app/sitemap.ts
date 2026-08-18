import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { publicWhere } from '@/lib/queries';
import { POLICIES } from '@/content/policies';

/** Only indexable URLs appear here: no empty categories, no thin tags,
 *  no search pages, no admin. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    ...POLICIES.map((p) => ({ url: `${base}/${p.slug}`, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ];

  try {
    const [articles, categories, tags, authors] = await Promise.all([
      prisma.article.findMany({
        where: publicWhere({ isIndexable: true }),
        select: { slug: true, updatedContentAt: true, publishedAt: true, category: { select: { slug: true } } },
        orderBy: { publishedAt: 'desc' },
        take: 5000,
      }),
      prisma.category.findMany({
        where: { isIndexable: true, articles: { some: { status: 'PUBLISHED' } } },
        select: { slug: true, updatedAt: true },
      }),
      prisma.tag.findMany({ where: { isIndexable: true }, select: { slug: true } }),
      prisma.author.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    ]);

    return [
      ...staticEntries,
      ...articles.map((a) => ({
        url: `${base}/${a.category?.slug ?? 'articles'}/${a.slug}`,
        lastModified: a.updatedContentAt ?? a.publishedAt ?? undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...categories.map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'daily' as const, priority: 0.6 })),
      ...tags.map((t) => ({ url: `${base}/tag/${t.slug}`, changeFrequency: 'weekly' as const, priority: 0.3 })),
      ...authors.map((a) => ({ url: `${base}/author/${a.slug}`, lastModified: a.updatedAt, changeFrequency: 'monthly' as const, priority: 0.4 })),
    ];
  } catch {
    return staticEntries;
  }
}
