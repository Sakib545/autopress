'use client';
import { useEffect } from 'react';

/** Records a view without opting the page out of static rendering. */
export function ViewPing({ articleId }: { articleId: string }) {
  useEffect(() => {
    const key = `viewed:${articleId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage blocked */ }
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      try { sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
      fetch('/api/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
        keepalive: true,
      }).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(timer);
  }, [articleId]);
  return null;
}
