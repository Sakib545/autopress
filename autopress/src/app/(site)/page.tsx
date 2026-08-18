import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { latestArticles, editorsPicks, trendingArticles, articlesByIntent, publicWhere } from '@/lib/queries';
import { ArticleCard, ArticleRow, articleHref } from '@/components/site/article-card';
import { NewsletterCta } from '@/components/site/newsletter';
import { AdSlotRender } from '@/components/site/ad-slot';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';


export default async function HomePage() {
  const [settings, latest, picks, trending, guides, comparisons, reviews, categories, total] = await Promise.all([
    getSettings(),
    latestArticles(13),
    editorsPicks(3),
    trendingArticles(5),
    articlesByIntent(['HOW_TO', 'TUTORIAL'], 3),
    articlesByIntent(['COMPARISON', 'ALTERNATIVES'], 3),
    articlesByIntent(['REVIEW', 'BEST_OF'], 3),
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: 'asc' }, take: 8, select: { name: true, slug: true, description: true, _count: { select: { articles: true } } } }),
    prisma.article.count({ where: publicWhere() }),
  ]);

  if (total === 0) {
    return (
      <div className="container-page py-24">
        <EmptyState
          title="No articles published yet"
          hint="Seed demo content with `npm run db:seed`, or open the admin dashboard and run topic discovery to start the pipeline."
          action={<Link href="/admin" className="btn-primary">Open admin dashboard</Link>}
        />
      </div>
    );
  }

  const [hero, ...rest] = latest;
  const secondary = rest.slice(0, 4);
  const grid = rest.slice(4, 10);

  return (
    <div className="container-page py-10 sm:py-14">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hero && (
            <article>
              <Link href={articleHref(hero)} className="relative block aspect-[16/9] overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                {hero.featuredMedia && (
                  <Image src={hero.featuredMedia.url} alt={hero.featuredMedia.altText} fill priority sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover" />
                )}
              </Link>
              {hero.category && (<Link href={`/category/${hero.category.slug}`} className="mt-5 block text-xs font-medium uppercase tracking-wider text-accent-700 hover:text-accent-800 dark:text-accent-400">{hero.category.name}</Link>)}
              <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">
                <Link href={articleHref(hero)} className="hover:text-accent-700 dark:hover:text-accent-400">{hero.title}</Link>
              </h1>
              {hero.excerpt && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600 dark:text-ink-400">{hero.excerpt}</p>}
              <p className="mt-3 text-xs text-ink-500">{formatDate(hero.publishedAt)} · {hero.readingTime} min read</p>
            </article>
          )}
        </div>

        {secondary.length > 0 && (<aside className="lg:border-l lg:rule lg:pl-8">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">Latest</h2>
          <div>{secondary.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
        </aside>)}
      </section>

      <AdSlotRender placement="HOMEPAGE_INLINE" />

      {/* Editor's picks */}
      {picks.length > 0 && (
        <section className="mt-16 border-t rule pt-10">
          <h2 className="mb-8 font-serif text-2xl">Editor&apos;s Picks</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}

      {/* Latest grid + trending rail */}
      <section className="mt-16 grid gap-10 border-t rule pt-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-8 font-serif text-2xl">More Articles</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {grid.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </div>
        <aside>
          <h2 className="mb-4 font-serif text-2xl">Trending</h2>
          <ol className="space-y-5">
            {trending.map((a, i) => (
              <li key={a.id} className="flex gap-4">
                <span className="font-serif text-2xl text-ink-300 dark:text-ink-700">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <Link href={articleHref(a)} className="font-serif leading-snug hover:text-accent-700 dark:hover:text-accent-400">{a.title}</Link>
                  <p className="mt-1 text-xs text-ink-500">{a.readingTime} min read</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {/* Format sections */}
      {[
        { title: 'Guides', items: guides },
        { title: 'Comparisons', items: comparisons },
        { title: 'Reviews', items: reviews },
      ].filter((s) => s.items.length > 0).map((section) => (
        <section key={section.title} className="mt-16 border-t rule pt-10">
          <h2 className="mb-8 font-serif text-2xl">{section.title}</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      ))}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mt-16 border-t rule pt-10">
          <h2 className="mb-8 font-serif text-2xl">Popular Categories</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="card-interactive p-5">
                <p className="font-serif text-lg">{c.name}</p>
                <p className="mt-1 text-xs text-ink-500">{c._count.articles} article{c._count.articles === 1 ? '' : 's'}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-16">
        <NewsletterCta
          title={`The ${settings.siteName} briefing`}
          blurb="One email when we publish something worth your time. Research-backed guides and comparisons, no filler."
          source="homepage"
        />
      </div>
    </div>
  );
}
