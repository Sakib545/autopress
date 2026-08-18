import { revalidatePath } from 'next/cache';

/** Publishing and updates flush the affected ISR paths so changes appear
 *  without a rebuild. Safe to call from the worker: it no-ops outside Next. */
export async function revalidateArticle(categorySlug: string, slug: string) {
  try {
    revalidatePath('/');
    revalidatePath(`/${categorySlug}/${slug}`);
    revalidatePath(`/category/${categorySlug}`);
    revalidatePath('/sitemap.xml');
  } catch {
    // Called outside a Next request context (worker process) — the web service
    // picks changes up on its next ISR interval instead.
  }
}
