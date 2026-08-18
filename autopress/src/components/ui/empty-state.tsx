export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="font-serif text-lg text-ink-800 dark:text-ink-200">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-500 dark:text-ink-400">{hint}</p>}
      {action}
    </div>
  );
}
