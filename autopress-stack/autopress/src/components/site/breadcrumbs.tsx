import Link from 'next/link';

export function Breadcrumbs({ trail }: { trail: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
        {trail.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-ink-300">/</span>}
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-ink-700 dark:text-ink-300">{item.name}</span>
            ) : (
              <Link href={item.href} className="hover:text-ink-900 dark:hover:text-ink-200">{item.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
