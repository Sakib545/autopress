'use client';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function SubmitButton({ children, className, pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn('btn-primary', className)}>
      {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {pending ? (pendingText ?? 'Working…') : children}
    </button>
  );
}
