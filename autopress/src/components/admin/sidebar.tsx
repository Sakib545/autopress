'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const NAV = [
  { group: 'Overview', items: [{ href: '/admin', label: 'Dashboard' }, { href: '/admin/analytics', label: 'Analytics' }] },
  {
    group: 'Content',
    items: [
      { href: '/admin/articles', label: 'Articles' },
      { href: '/admin/topics', label: 'Topics' },
      { href: '/admin/keywords', label: 'Keywords' },
      { href: '/admin/categories', label: 'Categories' },
      { href: '/admin/authors', label: 'Authors' },
      { href: '/admin/media', label: 'Media' },
    ],
  },
  {
    group: 'Automation',
    items: [
      { href: '/admin/automation', label: 'Automation' },
      { href: '/admin/queue', label: 'Publishing Queue' },
      { href: '/admin/ai', label: 'AI & Cost' },
      { href: '/admin/videos', label: 'Videos' },
      { href: '/admin/logs', label: 'Logs' },
    ],
  },
  {
    group: 'Monetization',
    items: [
      { href: '/admin/affiliate', label: 'Affiliate Links' },
      { href: '/admin/ads', label: 'Ad Slots' },
    ],
  },
  { group: 'Configuration', items: [{ href: '/admin/settings', label: 'Site Settings' }] },
];

export function AdminSidebar({ siteName, userEmail }: { siteName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="space-y-5">
      {NAV.map((section) => (
        <div key={section.group}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{section.group}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-3 text-sm transition-colors duration-150',
                      active
                        ? 'bg-accent-50 font-medium text-accent-800 dark:bg-accent-950/50 dark:text-accent-200'
                        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800/70 dark:hover:text-ink-100',
                    )}>
                    {/* Active rail reads faster than a filled block at this density. */}
                    <span aria-hidden className={cn(
                      'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-all duration-200 ease-swift',
                      active ? 'bg-accent-600 opacity-100 dark:bg-accent-400' : 'opacity-0 group-hover:opacity-40 group-hover:bg-ink-400',
                    )} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="btn-primary fixed bottom-4 right-4 z-50 shadow-pop lg:hidden">
        {open ? 'Close' : 'Menu'}
      </button>

      {open && <div className="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r rule bg-white/95 p-4 backdrop-blur-xl transition-transform duration-200 ease-swift dark:bg-ink-950/95 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        open ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full',
      )}>
        <Link href="/" className="mb-6 flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800/70">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-600 font-serif text-sm font-semibold text-white shadow-card">
            {siteName.trim().charAt(0).toUpperCase() || 'A'}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-base font-semibold">{siteName}</span>
            <span className="block truncate text-xs text-ink-500">{userEmail}</span>
          </span>
        </Link>
        {nav}
        <div className="mt-8 flex items-center justify-between border-t rule px-3 pt-4">
          <div className="space-y-1 text-xs">
            <Link href="/" className="block text-ink-500 hover:text-ink-900 dark:hover:text-ink-200">View site →</Link>
            <Link href="/api/auth/signout" className="block text-ink-500 hover:text-ink-900 dark:hover:text-ink-200">Sign out</Link>
          </div>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
