import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
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
    <header className="sticky top-0 z-40 border-b border-ink-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="container-page flex h-[4.75rem] items-center gap-5">
        <Link href="/" className="group flex shrink-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-xl bg-accent-600 font-serif text-base font-semibold text-white shadow-card transition-transform duration-200 ease-swift group-hover:scale-105"
          >
            {settings.siteName.trim().charAt(0).toUpperCase() || 'A'}
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
            {settings.siteName}
          </span>
        </Link>

        <span className="hidden h-8 w-px bg-ink-200 lg:block" />
        <p className="hidden max-w-xs text-xs leading-5 text-ink-500 lg:block">
          {settings.siteDescription}
        </p>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <SearchBox />
          <a
            href="#newsletter"
            className="hidden rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-700 hover:shadow-lift sm:inline-flex"
          >
            Subscribe
          </a>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="border-t border-ink-200/80">
        <div className="container-page flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
          <Link
            href="/#latest"
            className="whitespace-nowrap rounded-lg bg-accent-50 px-3 py-1.5 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-100"
          >
            Latest research
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={'/category/' + category.slug}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-white hover:text-ink-950"
            >
              {category.name}
            </Link>
          ))}
          <Link
            href="/editorial-policy"
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-white hover:text-ink-950"
          >
            Methodology
          </Link>
          <Link
            href="/about"
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-white hover:text-ink-950"
          >
            About
          </Link>
        </div>
      </nav>
    </header>
  );
}
