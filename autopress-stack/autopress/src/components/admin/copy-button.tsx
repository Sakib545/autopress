'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Copies a short value (a task id) to the clipboard. Client-side only; falls
 * back to a visible hint when the Clipboard API is unavailable (http origins).
 */
export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" onClick={copy}
      className={cn('btn-secondary px-2.5 py-1 text-xs', className)}
      title={value}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press ⌘C' : label}
    </button>
  );
}
