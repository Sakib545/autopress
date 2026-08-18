import { cn } from '@/lib/utils';

export function Field({ label, hint, children, className }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Text({ name, defaultValue, placeholder, required, type = 'text', ...rest }: {
  name: string; defaultValue?: string | number | null; placeholder?: string;
  required?: boolean; type?: string; min?: number; max?: number; step?: string;
}) {
  return (
    <input
      className="input"
      name={name}
      type={type}
      required={required}
      placeholder={placeholder}
      defaultValue={defaultValue ?? undefined}
      {...rest}
    />
  );
}

export function Area({ name, defaultValue, rows = 3, placeholder }: {
  name: string; defaultValue?: string | null; rows?: number; placeholder?: string;
}) {
  return (
    <textarea className="input" name={name} rows={rows} placeholder={placeholder} defaultValue={defaultValue ?? undefined} />
  );
}

export function Select({ name, options, defaultValue }: {
  name: string; options: { value: string; label: string }[]; defaultValue?: string | null;
}) {
  return (
    <select className="input" name={name} defaultValue={defaultValue ?? undefined}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-700 dark:bg-ink-900" />
      {label}
    </label>
  );
}

export function Section({ title, description, children, className }: {
  title: string; description?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('card p-5', className)}>
      <h2 className="font-serif text-lg tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-ink-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      'sticky top-0 z-10 border-b rule bg-ink-50/90 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 backdrop-blur-sm dark:bg-ink-900/80',
      className,
    )}>{children}</th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('border-t rule px-4 py-3 align-top transition-colors', className)}>{children}</td>;
}
