import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { SearchBox } from './search-box';

export async function SiteHeader() {
  const [settings, categories] = await Promise.all([
    getSettings(),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 6,
      select: { name: true, slug: true },
    }).catch(() => []),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b rule bg-white/80 backdrop-blur-xl backdrop-saturate-150 dark:bg-ink-950/75">
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          {/* Monogram mark keeps the wordmark anchored at every breakpoint. */}
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent-600 font-serif text-sm font-semibold text-white shadow-card transition-transform duration-200 ease-swift group-hover:scale-105"
          >
            {settings.siteName.trim().charAt(0).toUpperCase() || 'A'}
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight">{settings.siteName}</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Categories">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="rounded-lg px-2.5 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800/70 dark:hover:text-ink-100"
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SearchBox />
          <ThemeToggle />
        </div>
      </div>

      {/* Categories wrap to a scrollable strip on mobile rather than overflowing. */}
      {categories.length > 0 && (
        <nav aria-label="Categories" className="flex gap-2 overflow-x-auto border-t rule px-4 py-2 md:hidden no-scrollbar">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="whitespace-nowrap rounded-full bg-ink-100 px-3 py-1 text-sm text-ink-700 dark:bg-ink-800/70 dark:text-ink-300"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
