import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { publicWhere, cardSelect } from '@/lib/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { ArticleCard } from '@/components/site/article-card';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { EmptyState } from '@/components/ui/empty-state';


type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [tag, settings] = await Promise.all([prisma.tag.findUnique({ where: { slug } }), getSettings()]);
  if (!tag) return { title: 'Not found' };
  return buildMetadata({
    title: `${tag.name}`,
    description: tag.description ?? `Articles tagged ${tag.name}.`,
    path: `/tag/${tag.slug}`,
    siteName: settings.siteName,
    // Thin tag pages stay out of the index until they clear the admin threshold.
    noindex: !tag.isIndexable,
  });
}

export default async function TagPage({ params }: Params) {
  const { slug } = await params;
  const tag = await prisma.tag.findUnique({ where: { slug } });
  if (!tag) notFound();

  const articles = await prisma.article.findMany({
    where: publicWhere({ tags: { some: { tagId: tag.id } } }),
    orderBy: { publishedAt: 'desc' },
    take: 24,
    select: cardSelect,
  });

  return (
    <div className="container-page py-12">
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: `#${tag.name}`, href: `/tag/${tag.slug}` }]} />
      <h1 className="font-serif text-4xl">{tag.name}</h1>
      <p className="mt-2 text-sm text-ink-500">{articles.length} article{articles.length === 1 ? '' : 's'}</p>

      {articles.length === 0 ? (
        <div className="mt-10"><EmptyState title="No articles with this tag yet" /></div>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}
    </div>
  );
}
