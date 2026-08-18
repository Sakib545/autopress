import type { Metadata } from 'next';
import { searchArticles } from '@/lib/queries';
import { ArticleRow } from '@/components/site/article-card';
import { SearchBox } from '@/components/site/search-box';
import { EmptyState } from '@/components/ui/empty-state';

// Search result pages are never indexed.
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const results = query ? await searchArticles(query) : [];

  return (
    <div className="container-page py-12">
      <h1 className="font-serif text-4xl">Search</h1>
      <div className="mt-6 max-w-md"><SearchBox initial={query} autoFocus /></div>

      {query && (
        <p className="mt-6 text-sm text-ink-500">
          {results.length} result{results.length === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
        </p>
      )}

      <div className="mt-4 max-w-3xl">
        {query && results.length === 0 ? (
          <EmptyState title="No matches" hint="Try fewer or more general words — search covers titles, article text, categories, tags and keywords." />
        ) : (
          results.map((a) => <ArticleRow key={a.id} article={a} />)
        )}
      </div>
    </div>
  );
}
