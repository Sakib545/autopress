import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { latestArticles, editorsPicks, trendingArticles, articlesByIntent, publicWhere } from '@/lib/queries';
import { ArticleCard, ArticleRow, articleHref } from '@/components/site/article-card';
import { NewsletterCta } from '@/components/site/newsletter';
import { AdSlotRender } from '@/components/site/ad-slot';
import { formatDate } from '@/lib/utils';

const PROMISES = [
  {
    number: '01',
    title: 'Evidence before opinion',
    text: 'Claims are checked against product documentation, tests and sourced research.',
  },
  {
    number: '02',
    title: 'Useful comparisons',
    text: 'Clear trade-offs help you choose the right tool for your work and budget.',
  },
  {
    number: '03',
    title: 'Human-reviewed publishing',
    text: 'AI helps with production, while every article follows our editorial policy.',
  },
];

export default async function HomePage() {
  const [settings, latest, picks, trending, guides, comparisons, reviews, categories, total] = await Promise.all([
    getSettings(),
    latestArticles(13),
    editorsPicks(3),
    trendingArticles(5),
    articlesByIntent(['HOW_TO', 'TUTORIAL'], 3),
    articlesByIntent(['COMPARISON', 'ALTERNATIVES'], 3),
    articlesByIntent(['REVIEW', 'BEST_OF'], 3),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      take: 8,
      select: {
        name: true,
        slug: true,
        description: true,
        _count: { select: { articles: true } },
      },
    }),
    prisma.article.count({ where: publicWhere() }),
  ]);

  if (total === 0) {
    return (
      <div className="container-page pb-20 pt-10 sm:pt-14">
        <section className="overflow-hidden rounded-[2rem] border border-ink-200/80 bg-white/90 shadow-card">
          <div className="grid lg:grid-cols-[1.55fr_0.85fr]">
            <div className="px-6 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
              <p className="eyebrow text-accent-700">Independent technology intelligence</p>
              <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-[1.06] text-ink-950 sm:text-5xl lg:text-6xl">
                Research-backed reviews for better software decisions.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-ink-600 sm:text-lg">
                We test AI tools and software, compare real-world trade-offs, and turn complex research into clear, practical guidance.
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                {categories.length > 0 ? categories.slice(0, 5).map((category) => (
                  <Link
                    key={category.slug}
                    href={'/category/' + category.slug}
                    className="rounded-full border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-800 transition-colors hover:border-accent-300 hover:bg-accent-100"
                  >
                    {category.name}
                  </Link>
                )) : (
                  <>
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-800">AI tools</span>
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-800">Software reviews</span>
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-800">Comparisons</span>
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-800">Practical guides</span>
                  </>
                )}
              </div>

              <p className="mt-8 text-sm font-medium text-ink-500">
                New independent reviews and guides are being prepared for publication.
              </p>
            </div>

            <aside className="border-t border-ink-200/80 bg-accent-50/70 px-6 py-10 sm:px-10 lg:border-l lg:border-t-0 lg:px-9 lg:py-16">
              <p className="eyebrow text-accent-700">Our editorial standard</p>
              <div className="mt-7 divide-y divide-accent-200/70">
                {PROMISES.map((item) => (
                  <div key={item.number} className="grid grid-cols-[2.5rem_1fr] gap-3 py-5 first:pt-0">
                    <span className="font-serif text-xl text-accent-600">{item.number}</span>
                    <div>
                      <h2 className="font-serif text-lg text-ink-900">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-ink-600">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/editorial-policy" className="mt-7 inline-flex text-sm font-semibold text-accent-700 hover:text-accent-800">
                Read our editorial policy →
              </Link>
            </aside>
          </div>
        </section>

        <section className="mt-12 grid gap-7 border-y border-ink-200/80 py-9 sm:grid-cols-3">
          <div>
            <p className="eyebrow">Reviews</p>
            <h2 className="mt-2 font-serif text-xl text-ink-900">Hands-on, decision-ready</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">What works, what does not, and who each product is really for.</p>
          </div>
          <div className="sm:border-l sm:border-ink-200 sm:pl-7">
            <p className="eyebrow">Comparisons</p>
            <h2 className="mt-2 font-serif text-xl text-ink-900">Trade-offs made clear</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">Feature, pricing, privacy and usability compared without the hype.</p>
          </div>
          <div className="sm:border-l sm:border-ink-200 sm:pl-7">
            <p className="eyebrow">Guides</p>
            <h2 className="mt-2 font-serif text-xl text-ink-900">Practical from the first step</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">Focused instructions that help readers get useful results quickly.</p>
          </div>
        </section>
      </div>
    );
  }

  const [hero, ...rest] = latest;
  const secondary = rest.slice(0, 5);
  const grid = rest.slice(5, 11);

  return (
    <div className="container-page pb-20 pt-8 sm:pt-11">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200/90 pb-3">
        <div>
          <p className="eyebrow text-accent-700">Latest research</p>
          <p className="mt-1 text-sm text-ink-500">Independent reviews, comparisons and practical guides.</p>
        </div>
        <Link href="/search" className="text-sm font-semibold text-accent-700 hover:text-accent-800">
          Browse all articles →
        </Link>
      </div>

      <section className="grid gap-8 xl:grid-cols-12">
        {hero && (
          <>
            <article className="flex flex-col justify-center xl:col-span-5 xl:pr-4">
              {hero.category && (
                <Link href={'/category/' + hero.category.slug} className="eyebrow text-accent-700">
                  Featured · {hero.category.name}
                </Link>
              )}
              <h1 className="mt-4 font-serif text-4xl leading-[1.08] text-ink-950 sm:text-5xl">
                <Link href={articleHref(hero)} className="transition-colors hover:text-accent-700">
                  {hero.title}
                </Link>
              </h1>
              {hero.excerpt && (
                <p className="mt-5 max-w-2xl text-base leading-7 text-ink-600">{hero.excerpt}</p>
              )}
              <p className="mt-5 text-sm text-ink-500">
                {formatDate(hero.publishedAt)} · {hero.readingTime} min read
              </p>
              <Link href={articleHref(hero)} className="mt-7 inline-flex w-fit rounded-lg bg-accent-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-accent-700 hover:shadow-lift">
                Read the full article →
              </Link>
            </article>

            <Link
              href={articleHref(hero)}
              className="relative min-h-[22rem] overflow-hidden rounded-2xl bg-ink-100 shadow-card ring-1 ring-inset ring-black/[0.05] sm:min-h-[30rem] xl:col-span-4"
            >
              {hero.featuredMedia && (
                <Image
                  src={hero.featuredMedia.url}
                  alt={hero.featuredMedia.altText || hero.title}
                  fill
                  priority
                  sizes="(max-width: 1280px) 100vw, 34vw"
                  className="object-cover transition-transform duration-700 hover:scale-[1.025]"
                />
              )}
            </Link>
          </>
        )}

        {secondary.length > 0 && (
          <aside className="border-t border-ink-200 pt-6 xl:col-span-3 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
            <div className="section-head">
              <h2 className="eyebrow text-ink-700">Latest stories</h2>
            </div>
            <div>{secondary.map((article) => <ArticleRow key={article.slug} article={article} />)}</div>
          </aside>
        )}
      </section>

      <AdSlotRender placement="HOMEPAGE_INLINE" />

      {picks.length > 0 && (
        <section className="mt-16 border-t border-ink-200/90 pt-10">
          <div className="section-head mb-8">
            <div>
              <p className="eyebrow text-accent-700">Curated by our editors</p>
              <h2 className="mt-2 font-serif text-3xl">Editor&apos;s Picks</h2>
            </div>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((article) => <ArticleCard key={article.slug} article={article} />)}
          </div>
        </section>
      )}

      <section id="latest" className="mt-16 grid gap-12 border-t border-ink-200/90 pt-10 lg:grid-cols-[1.7fr_0.8fr]">
        <div>
          <h2 className="mb-7 font-serif text-3xl">Latest reviews</h2>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {grid.map((article) => <ArticleCard key={article.slug} article={article} />)}
          </div>
        </div>
        <aside>
          <h2 className="mb-4 font-serif text-3xl">Most useful this week</h2>
          <ol className="divide-y divide-ink-200">
            {trending.map((article, index) => (
              <li key={article.slug} className="grid grid-cols-[2rem_1fr] gap-3 py-5 first:pt-0">
                <span className="font-serif text-lg text-accent-600">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <Link href={articleHref(article)} className="font-serif text-lg leading-snug text-ink-900 transition-colors hover:text-accent-700">
                    {article.title}
                  </Link>
                  <p className="mt-1 text-xs text-ink-500">{article.readingTime} min read</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {[
        { title: 'Practical guides', items: guides },
        { title: 'Comparisons', items: comparisons },
        { title: 'Reviews', items: reviews },
      ].filter((section) => section.items.length > 0).map((section) => (
        <section key={section.title} className="mt-16 border-t border-ink-200/90 pt-10">
          <h2 className="mb-8 font-serif text-3xl">{section.title}</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((article) => <ArticleCard key={article.slug} article={article} />)}
          </div>
        </section>
      ))}

      {categories.length > 0 && (
        <section className="mt-16 border-y border-ink-200/90 py-9">
          <p className="eyebrow mb-6 text-ink-700">Explore topics</p>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link key={category.slug} href={'/category/' + category.slug} className="group flex items-center justify-between border-b border-ink-200 pb-3">
                <span className="font-serif text-lg transition-colors group-hover:text-accent-700">{category.name}</span>
                <span className="text-xs text-ink-500">{category._count.articles}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div id="newsletter" className="mt-16">
        <NewsletterCta
          title={'The ' + settings.siteName + ' briefing'}
          blurb="Independent reviews, comparisons and practical guides—one useful email at a time."
          source="homepage"
        />
      </div>
    </div>
  );
}
