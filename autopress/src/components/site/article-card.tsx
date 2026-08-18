import Link from 'next/link';
import Image from 'next/image';
import { formatDate, truncate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type CardArticle = {
  title: string;
  slug: string;
  excerpt: string | null;
  readingTime: number;
  publishedAt: Date | null;
  sponsorship?: string;
  category: { name: string; slug: string } | null;
  featuredMedia: { url: string; altText: string } | null;
};

export function articleHref(a: { slug: string; category: { slug: string } | null }) {
  return `/${a.category?.slug ?? 'articles'}/${a.slug}`;
}

/** Shared meta line so cards and rows never drift apart. */
function Meta({ article }: { article: CardArticle }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
      <span>{formatDate(article.publishedAt)}</span>
      <span aria-hidden className="h-1 w-1 rounded-full bg-ink-300 dark:bg-ink-700" />
      <span>{article.readingTime} min read</span>
    </p>
  );
}

export function ArticleCard({ article, priority = false }: { article: CardArticle; priority?: boolean }) {
  const href = articleHref(article);
  return (
    <article className="group flex flex-col">
      <Link
        href={href}
        className="relative block aspect-[16/9] overflow-hidden rounded-xl bg-ink-100 shadow-card ring-1 ring-inset ring-black/[0.04] transition-shadow duration-300 ease-swift group-hover:shadow-lift dark:bg-ink-800 dark:ring-white/[0.06]"
      >
        {article.featuredMedia ? (
          <Image
            src={article.featuredMedia.url} alt={article.featuredMedia.altText || article.title}
            fill priority={priority} sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 ease-swift group-hover:scale-[1.04]"
          />
        ) : (
          <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-accent-100 to-ink-100 dark:from-accent-950 dark:to-ink-900" />
        )}
        {/* Category rides on the image so the text column stays a clean rhythm. */}
        {article.category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-800 backdrop-blur-sm dark:bg-ink-950/85 dark:text-ink-100">
            {article.category.name}
          </span>
        )}
      </Link>

      <div className="mt-4 flex flex-1 flex-col">
        {article.sponsorship && article.sponsorship !== 'NONE' && (
          <div className="mb-2"><Badge tone="amber">Sponsored</Badge></div>
        )}

        <h3 className="font-serif text-xl leading-snug text-balance">
          <Link href={href} className="transition-colors group-hover:text-accent-700 dark:group-hover:text-accent-400">
            {article.title}
          </Link>
        </h3>

        {article.excerpt && (
          <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-400">{truncate(article.excerpt, 140)}</p>
        )}

        <div className="mt-auto"><Meta article={article} /></div>
      </div>
    </article>
  );
}

export function ArticleRow({ article }: { article: CardArticle }) {
  const href = articleHref(article);
  return (
    <article className="group flex gap-4 border-b rule py-5 transition-colors last:border-0">
      <div className="min-w-0 flex-1">
        {article.category && (
          <Link href={`/category/${article.category.slug}`} className="eyebrow mb-1.5 block text-accent-700 dark:text-accent-400">
            {article.category.name}
          </Link>
        )}
        <h3 className="font-serif text-lg leading-snug">
          <Link href={href} className="transition-colors group-hover:text-accent-700 dark:group-hover:text-accent-400">{article.title}</Link>
        </h3>
        {article.excerpt && <p className="mt-1.5 line-clamp-2 text-sm text-ink-600 dark:text-ink-400">{truncate(article.excerpt, 120)}</p>}
        <Meta article={article} />
      </div>
      {article.featuredMedia && (
        <Link
          href={href}
          className="relative hidden h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-inset ring-black/[0.04] sm:block dark:bg-ink-800 dark:ring-white/[0.06]"
        >
          <Image
            src={article.featuredMedia.url} alt={article.featuredMedia.altText} fill sizes="128px"
            className="object-cover transition-transform duration-500 ease-swift group-hover:scale-[1.05]"
          />
        </Link>
      )}
    </article>
  );
}
