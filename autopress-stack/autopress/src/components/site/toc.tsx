'use client';
import { useEffect, useState } from 'react';
import type { Heading } from '@/lib/content/markdown';
import { cn } from '@/lib/utils';

/** Highlights the section currently in view. Collapsible on mobile. */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav aria-label="Table of contents" className="card p-4 lg:sticky lg:top-24 lg:border-0 lg:bg-transparent lg:p-0 dark:lg:bg-transparent">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-500 lg:cursor-default lg:pointer-events-none">
        On this page
        <span className="lg:hidden">{open ? '−' : '+'}</span>
      </button>
      <ul className={cn('mt-3 space-y-2 text-sm', open ? 'block' : 'hidden lg:block')}>
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'pl-4' : ''}>
            <a href={`#${h.id}`} onClick={() => setOpen(false)}
              className={cn('block leading-snug transition-colors',
                active === h.id ? 'font-medium text-accent-700 dark:text-accent-400' : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-200')}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
