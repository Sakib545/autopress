import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { publicWhere, cardSelect } from '@/lib/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema } from '@/lib/seo/schema';
import { ArticleCard, ArticleRow } from '@/components/site/article-card';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { Pagination } from '@/components/site/pagination';
import { EmptyState } from '@/components/ui/empty-state';

const PER_PAGE = 12;

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };


export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [category, settings] = await Promise.all([
    prisma.category.findUnique({ where: { slug } }),
    getSettings(),
  ]);
  if (!category) return { title: 'Not found' };

  const count = await prisma.article.count({ where: publicWhere({ categoryId: category.id }) });
  return buildMetadata({
    title: category.seoTitle ?? `${category.name} — guides, comparisons and reviews`,
    description: category.seoDesc ?? category.description ?? `Articles about ${category.name}.`,
    path: `/category/${category.slug}`,
    siteName: settings.siteName,
    // Empty categories are kept out of the index.
    noindex: !category.isIndexable || count === 0,
  });
}

export default async function CategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const category = await prisma.category.findUnique({
    where: { slug },
    include: { children: { select: { name: true, slug: true } } },
  });
  if (!category) notFound();

  const where = publicWhere({ categoryId: category.id });
  const [featured, articles, popular, total] = await Promise.all([
    page === 1 ? prisma.article.findFirst({ where, orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }], select: cardSelect }) : null,
    prisma.article.findMany({ where, orderBy: { publishedAt: 'desc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, select: cardSelect }),
    prisma.article.findMany({ where, orderBy: { viewCount: 'desc' }, take: 5, select: cardSelect }),
    prisma.article.count({ where }),
  ]);

  const trail = [{ name: 'Home', href: '/' }, { name: category.name, href: `/category/${category.slug}` }];
  const rest = featured ? articles.filter((a) => a.id !== featured.id) : articles;

  return (
    <div className="container-page py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(trail)) }} />
      <Breadcrumbs trail={trail} />

      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl">{category.name}</h1>
        {category.description && <p className="mt-3 text-lg leading-relaxed text-ink-600 dark:text-ink-400">{category.description}</p>}
        <p className="mt-3 text-sm text-ink-500">{total} article{total === 1 ? '' : 's'}</p>
      </header>

      {category.children.length > 0 && (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Subcategories">
          {category.children.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="chip bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300">{c.name}</Link>
          ))}
        </nav>
      )}

      {total === 0 ? (
        <div className="mt-10"><EmptyState title="Nothing published in this category yet" hint="This page is set to noindex until it has articles." /></div>
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            {featured && (
              <div className="mb-10 border-b rule pb-10">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Featured</p>
                <ArticleCard article={featured} priority />
              </div>
            )}
            <div className="grid gap-8 sm:grid-cols-2">
              {rest.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
            <Pagination page={page} totalPages={Math.ceil(total / PER_PAGE)} basePath={`/category/${category.slug}`} />
          </div>

          <aside>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Most read</h2>
            {popular.map((a) => <ArticleRow key={a.id} article={a} />)}
          </aside>
        </div>
      )}
    </div>
  );
}
