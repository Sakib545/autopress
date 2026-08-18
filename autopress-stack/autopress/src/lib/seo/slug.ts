import { prisma } from '../db';
import { slugify } from '../utils';

/** Slug uniqueness is enforced by a DB unique index; this just avoids the retry. */
export async function uniqueArticleSlug(title: string, excludeId?: string) {
  const base = slugify(title) || 'article';
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = await prisma.article.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now().toString(36)}`;
  }
}

export async function uniqueCategorySlug(name: string) {
  const base = slugify(name) || 'category';
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = await prisma.category.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now().toString(36)}`;
  }
}
