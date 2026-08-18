import Link from 'next/link';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, href, tone = 'default' }: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger' ? 'text-red-600 dark:text-red-400'
    : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-ink-900 dark:text-ink-100';

  /* A hairline in the tone colour makes a bad number visible before it is read. */
  const railClass =
    tone === 'danger' ? 'bg-red-500'
    : tone === 'warning' ? 'bg-amber-500'
    : tone === 'success' ? 'bg-emerald-500'
    : 'bg-accent-500';

  const inner = (
    <>
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-0.5 rounded-t-xl', railClass, tone === 'default' && 'opacity-0 transition-opacity duration-200 group-hover:opacity-100')} />
      <p className="eyebrow">{label}</p>
      <p className={cn('mt-1.5 font-serif text-3xl tabular-nums leading-none', toneClass)}>{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </>
  );

  if (href) {
    return <Link href={href} className="card-interactive group relative block overflow-hidden p-4">{inner}</Link>;
  }
  return <div className="card group relative overflow-hidden p-4">{inner}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b rule pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Horizontal-scrolling table wrapper — admin tables never break mobile layout. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">{children}</table>
      </div>
    </div>
  );
}
