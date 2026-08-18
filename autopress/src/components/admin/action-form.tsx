'use client';

import { useActionState } from 'react';
import { cn } from '@/lib/utils';

export type ActionResult = { ok: boolean; message: string };
type ServerAction = (formData: FormData) => Promise<ActionResult>;

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p role="status" className={cn('mt-3 rounded-lg px-3 py-2 text-sm',
      state.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
               : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300')}>
      {state.message}
    </p>
  );
}

/** Wraps a server action in a form with inline pending + result feedback. */
export function ActionForm({
  action, children, className, submitLabel, pendingLabel, variant = 'primary', confirmText,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  className?: string;
  submitLabel: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => action(formData),
    null,
  );

  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-secondary';

  return (
    <form action={formAction} className={className}
      onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
      {children}
      <button type="submit" disabled={pending} className={cn(variantClass, 'mt-0')}>
        {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
        {pending ? (pendingLabel ?? 'Working…') : submitLabel}
      </button>
      <Result state={state} />
    </form>
  );
}

/** Compact single-button form for row-level actions. */
export function ActionButton({
  action, label, fields = {}, variant = 'secondary', confirmText, pendingLabel,
}: {
  action: ServerAction;
  label: string;
  fields?: Record<string, string>;
  variant?: 'primary' | 'secondary' | 'danger';
  confirmText?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => action(formData),
    null,
  );

  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-secondary';

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <form action={formAction}
        onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button type="submit" disabled={pending} className={cn(variantClass, 'px-2.5 py-1 text-xs')}>
          {pending ? (pendingLabel ?? '…') : label}
        </button>
      </form>
      {state && (
        <span className={cn('max-w-xs text-xs', state.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
          {state.message}
        </span>
      )}
    </span>
  );
}
