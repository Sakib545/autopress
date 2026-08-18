'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export function SearchBox({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  const id = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} role="search" className="relative">
      <label htmlFor={id} className="sr-only">Search articles</label>
      <input
        id={id} type="search" value={q} autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)} placeholder="Search…"
        className="input w-36 py-1.5 pl-8 text-sm sm:w-56"
      />
      <svg className="pointer-events-none absolute left-2.5 top-2.5 text-ink-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
    </form>
  );
}
