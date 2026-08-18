import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchBox } from '@/components/site/search-box';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-32 text-center">
      <p className="font-serif text-6xl text-ink-300 dark:text-ink-700">404</p>
      <h1 className="mt-4 font-serif text-2xl">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">It may have been moved, consolidated into another article, or never existed.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn-primary">Back to home</Link>
        <Link href="/search" className="btn-secondary">Search</Link>
      </div>
      <div className="mt-8 w-full max-w-sm"><SearchBox autoFocus /></div>
    </div>
  );
}
