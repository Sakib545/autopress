import { prisma } from '@/lib/db';
import type { AdPlacement } from '@prisma/client';

/**
 * Renders an admin-configured ad unit. Renders nothing at all when the slot is
 * inactive or has no code, so no empty boxes appear in the layout.
 */
export async function AdSlotRender({ placement, categoryId, wordCount = 0 }: { placement: AdPlacement; categoryId?: string | null; wordCount?: number }) {
  const slot = await prisma.adSlot
    .findFirst({ where: { placement, isActive: true }, orderBy: { createdAt: 'asc' } })
    .catch(() => null);

  if (!slot?.adCode) return null;
  if (wordCount < slot.minWordCount) return null;
  if (slot.categoryIds.length > 0 && (!categoryId || !slot.categoryIds.includes(categoryId))) return null;

  return (
    <aside className="my-8" aria-label="Advertisement">
      <p className="mb-1 text-center text-[10px] uppercase tracking-widest text-ink-400">Advertisement</p>
      <div className="flex justify-center overflow-hidden" dangerouslySetInnerHTML={{ __html: slot.adCode }} />
    </aside>
  );
}
