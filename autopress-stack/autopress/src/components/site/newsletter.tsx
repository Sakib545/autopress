'use client';
import { useId, useState } from 'react';

export function NewsletterForm({ source = 'article', compact = false }: { source?: string; compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const id = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) throw new Error('Server error. Try again later.');
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Something went wrong.');
      setState('done');
      setMessage(data.message ?? 'Check your inbox to confirm.');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (state === 'done') {
    return <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>;
  }

  return (
    <form onSubmit={submit} className={compact ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap' : 'flex flex-col gap-3 sm:flex-row sm:flex-wrap'}>
      <label htmlFor={id} className="sr-only">Email address</label>
      <input
        id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com" className="input sm:flex-1"
      />
      <button type="submit" disabled={state === 'loading'} className="btn-primary shrink-0">
        {state === 'loading' ? 'Subscribing…' : 'Subscribe'}
      </button>
      {state === 'error' && <p className="text-sm text-red-600 sm:w-full">{message}</p>}
    </form>
  );
}

export function NewsletterCta({ title, blurb, source }: { title: string; blurb: string; source: string }) {
  return (
    <section className="card bg-ink-50 p-6 sm:p-8 dark:bg-ink-900/60">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600 dark:text-ink-400">{blurb}</p>
      <div className="mt-5 max-w-lg"><NewsletterForm source={source} /></div>
      <p className="mt-3 text-xs text-ink-500">No spam. Unsubscribe any time.</p>
    </section>
  );
}
