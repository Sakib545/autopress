import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => (p === 1 ? basePath : `${basePath}${basePath.includes('?') ? '&' : '?'}page=${p}`);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav className="mt-12 flex items-center justify-center gap-1.5" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} className="btn-secondary px-3 py-1.5">Previous</Link>}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-ink-400">…</span>}
          <Link href={href(p)} aria-current={p === page ? 'page' : undefined}
            className={cn('btn px-3 py-1.5', p === page ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900' : 'btn-secondary')}>
            {p}
          </Link>
        </span>
      ))}
      {page < totalPages && <Link href={href(page + 1)} className="btn-secondary px-3 py-1.5">Next</Link>}
    </nav>
  );
}
