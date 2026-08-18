import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { publicWhere, relatedArticles, adjacentArticles } from '@/lib/queries';
import { addHeadingIds, extractFaqs } from '@/lib/content/markdown';
import { buildMetadata } from '@/lib/seo/metadata';
import { articleSchema, breadcrumbSchema, faqSchema } from '@/lib/seo/schema';
import { formatDate } from '@/lib/utils';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { TableOfContents } from '@/components/site/toc';
import { ArticleCard, articleHref } from '@/components/site/article-card';
import { NewsletterCta } from '@/components/site/newsletter';
import { AdSlotRender } from '@/components/site/ad-slot';
import { Badge } from '@/components/ui/badge';
import { ViewPing } from '@/components/site/view-ping';

export const revalidate = 900;
export const dynamicParams = true;

type Params = { params: Promise<{ category: string; slug: string }> };

async function loadArticle(slug: string) {
  return prisma.article.findFirst({
    where: publicWhere({ slug }),
    include: {
      category: true,
      author: true,
      featuredMedia: true,
      tags: { include: { tag: true } },
      sources: { include: { source: true }, orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function generateStaticParams() {
  try {
    const articles = await prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: { slug: true, category: { select: { slug: true } } },
    });
    return articles.map((a) => ({ category: a.category?.slug ?? 'articles', slug: a.slug }));
  } catch {
    // Database unavailable at build time — pages render on demand instead.
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [article, settings] = await Promise.all([loadArticle(slug), getSettings()]);
  if (!article) return { title: 'Not found' };

  return buildMetadata({
    title: article.seoTitle ?? article.title,
    description: article.metaDesc ?? article.excerpt ?? settings.siteDescription,
    path: `/${article.category?.slug ?? 'articles'}/${article.slug}`,
    imageUrl: article.featuredMedia?.url,
    siteName: settings.siteName,
    type: 'article',
    publishedAt: article.publishedAt,
    modifiedAt: article.updatedContentAt,
    noindex: !article.isIndexable,
    canonical: article.canonicalUrl,
  });
}

export default async function ArticlePage({ params }: Params) {
  const { category: categorySlug, slug } = await params;
  const [article, settings] = await Promise.all([loadArticle(slug), getSettings()]);
  if (!article) notFound();

  const actualCategory = article.category?.slug ?? 'articles';
  if (actualCategory !== categorySlug) notFound();

  const { html, headings } = addHeadingIds(article.contentHtml ?? '');
  const faqs = article.hasVisibleFaq ? extractFaqs(html) : [];

  const [related, adjacent] = await Promise.all([
    relatedArticles(article.id, article.clusterId, article.categoryId, 3),
    adjacentArticles(article.publishedAt),
  ]);

  const trail = [
    { name: 'Home', href: '/' },
    ...(article.category ? [{ name: article.category.name, href: `/category/${article.category.slug}` }] : []),
    { name: article.title, href: `/${actualCategory}/${article.slug}` },
  ];

  const updated = article.updatedContentAt && article.publishedAt &&
    article.updatedContentAt.getTime() - article.publishedAt.getTime() > 86_400_000;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([
        articleSchema({
          title: article.title,
          description: article.metaDesc ?? article.excerpt ?? '',
          slug: article.slug,
          categorySlug: actualCategory,
          imageUrl: article.featuredMedia?.url,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedContentAt,
          authorName: article.author?.name,
          authorSlug: article.author?.slug,
          siteName: settings.siteName,
        }),
        breadcrumbSchema(trail),
        // FAQ schema is emitted only when the page actually renders visible FAQs.
        ...(faqs.length > 0 ? [faqSchema(faqs)] : []),
      ]) }} />

      <ViewPing articleId={article.id} />

      <div className="container-page py-8 sm:py-12">
        <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-none lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12">
          <article className="min-w-0">
            <Breadcrumbs trail={trail} />

            {article.sponsorship !== 'NONE' && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <strong className="font-semibold">
                  {article.sponsorship === 'PAID_PARTNERSHIP' ? 'Paid partnership' : article.sponsorship === 'ADVERTISEMENT' ? 'Advertisement' : 'Sponsored'}
                </strong>
                {article.sponsorName ? ` — produced in partnership with ${article.sponsorName}.` : ' — this content was paid for by a sponsor.'}
              </div>
            )}

            <h1 className="font-serif text-3xl leading-tight sm:text-4xl lg:text-[2.75rem]">{article.title}</h1>
            {article.subtitle && <p className="mt-4 text-lg leading-relaxed text-ink-600 dark:text-ink-400">{article.subtitle}</p>}

            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-y rule py-4 text-sm text-ink-500">
              {article.author && (
                <Link href={`/author/${article.author.slug}`} className="flex items-center gap-2 font-medium text-ink-800 dark:text-ink-200">
                  {article.author.imageUrl && (
                    <Image src={article.author.imageUrl} alt="" width={28} height={28} className="rounded-full" />
                  )}
                  {article.author.name}
                </Link>
              )}
              <span aria-hidden>·</span>
              <time dateTime={article.publishedAt?.toISOString()}>{formatDate(article.publishedAt)}</time>
              {updated && (<><span aria-hidden>·</span><span>Updated {formatDate(article.updatedContentAt)}</span></>)}
              <span aria-hidden>·</span>
              <span>{article.readingTime} min read</span>
              {article.isSample && <Badge tone="purple">Sample content</Badge>}
            </div>

            {article.featuredMedia && (
              <figure className="mt-8">
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                  <Image
                    src={article.featuredMedia.url} alt={article.featuredMedia.altText}
                    fill priority sizes="(max-width: 1024px) 100vw, 760px" className="object-cover"
                  />
                </div>
                {(article.featuredMedia.caption || article.featuredMedia.attribution) && (
                  <figcaption className="mt-2 text-xs text-ink-500">
                    {article.featuredMedia.caption}
                    {article.featuredMedia.attribution && <span className="ml-1 text-ink-400">({article.featuredMedia.attribution})</span>}
                  </figcaption>
                )}
              </figure>
            )}

            {article.hasAffiliateLinks && (
              <p className="mt-6 rounded-lg bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-900 dark:text-ink-400">
                {settings.affiliateDisclosure}
              </p>
            )}

            {/* Mobile TOC sits inline; desktop uses the sticky rail. */}
            <div className="mt-8 lg:hidden"><TableOfContents headings={headings} /></div>

            <AdSlotRender placement="BELOW_INTRO" categoryId={article.categoryId} wordCount={article.wordCount} />

            <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: html }} />

            <AdSlotRender placement="END_ARTICLE" categoryId={article.categoryId} wordCount={article.wordCount} />

            {article.sources.length > 0 && (
              <section className="mt-12 border-t rule pt-6">
                <h2 className="font-serif text-xl">Sources</h2>
                <ol className="mt-3 space-y-2 text-sm">
                  {article.sources.map(({ source }) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer nofollow"
                        className="text-accent-700 underline-offset-2 hover:underline dark:text-accent-400">
                        {source.title ?? source.domain}
                      </a>
                      <span className="text-ink-500"> — {source.domain}
                        {source.publishedAt ? `, ${formatDate(source.publishedAt)}` : ''}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {article.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {article.tags.map(({ tag }) => (
                  <Link key={tag.id} href={`/tag/${tag.slug}`} className="chip bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300">
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}

            {article.author && (
              <section className="card mt-10 flex flex-col gap-4 p-6 sm:flex-row">
                {article.author.imageUrl && (
                  <Image src={article.author.imageUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full object-cover" />
                )}
                <div>
                  <p className="font-serif text-lg">
                    <Link href={`/author/${article.author.slug}`} className="hover:text-accent-700">{article.author.name}</Link>
                  </p>
                  {article.author.bio && <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-400">{article.author.bio}</p>}
                  {!article.author.isHuman && (
                    <p className="mt-2 text-xs text-ink-500">
                      Editorial identity. Articles are AI-assisted, fact-checked against cited sources, and published under our{' '}
                      <Link href="/ai-content-policy" className="underline">AI content policy</Link>.
                    </p>
                  )}
                </div>
              </section>
            )}

            <nav className="mt-10 grid gap-4 border-t rule pt-6 sm:grid-cols-2">
              {adjacent.prev && (
                <Link href={articleHref(adjacent.prev)} className="card-interactive p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-500">← Previous</p>
                  <p className="mt-1 font-serif leading-snug">{adjacent.prev.title}</p>
                </Link>
              )}
              {adjacent.next && (
                <Link href={articleHref(adjacent.next)} className="card-interactive p-4 text-right sm:col-start-2">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Next →</p>
                  <p className="mt-1 font-serif leading-snug">{adjacent.next.title}</p>
                </Link>
              )}
            </nav>
          </article>

          <aside className="hidden lg:block">
            <TableOfContents headings={headings} />
            <div className="mt-8"><AdSlotRender placement="SIDEBAR" categoryId={article.categoryId} /></div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-16 border-t rule pt-10">
            <h2 className="mb-8 font-serif text-2xl">Related reading</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </section>
        )}

        <div className="mt-16">
          <NewsletterCta title="Get the next one by email" blurb="Practical, sourced guides on the tools you actually use. One email per publish." source="article" />
        </div>
      </div>
    </>
  );
}
