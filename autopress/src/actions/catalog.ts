'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logError } from '@/lib/logging';
import { slugify } from '@/lib/utils';
import { uniqueCategorySlug } from '@/lib/seo/slug';
import type { ActionState } from './topics';

/* ---------------------------------- categories --------------------------- */

export async function saveCategoryAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const id = String(formData.get('id') ?? '');
    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 2) return { ok: false, message: 'Category name is too short.' };

    const data = {
      name,
      description: String(formData.get('description') ?? '') || null,
      seoTitle: String(formData.get('seoTitle') ?? '') || null,
      seoDesc: String(formData.get('seoDesc') ?? '') || null,
      isIndexable: formData.get('isIndexable') === 'on',
      sortOrder: Number(formData.get('sortOrder')) || 0,
      parentId: String(formData.get('parentId') ?? '') || null,
    };

    if (id && data.parentId === id) return { ok: false, message: 'A category cannot be its own parent.' };

    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      await prisma.category.create({ data: { ...data, slug: await uniqueCategorySlug(name) } });
    }
    revalidatePath('/admin/categories');
    revalidatePath('/', 'layout');
    return { ok: true, message: id ? 'Category updated.' : 'Category created.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:saveCategory', error: err }) };
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const id = String(formData.get('id') ?? '');
    const count = await prisma.article.count({ where: { categoryId: id } });
    if (count > 0) return { ok: false, message: `Cannot delete: ${count} article(s) still use this category. Reassign them first.` };
    await prisma.category.delete({ where: { id } });
    revalidatePath('/admin/categories');
    return { ok: true, message: 'Category deleted.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:deleteCategory', error: err }) };
  }
}

/* ----------------------------------- authors ----------------------------- */

export async function saveAuthorAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const id = String(formData.get('id') ?? '');
    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 2) return { ok: false, message: 'Author name is too short.' };

    const socialRaw = String(formData.get('socialLinks') ?? '').trim();
    let socialLinks: Record<string, string> = {};
    if (socialRaw) {
      for (const line of socialRaw.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const label = line.slice(0, idx).trim().toLowerCase();
          const url = line.slice(idx + 1).trim();
          if (label && url) socialLinks[label] = url;
        }
      }
    }

    const data = {
      name,
      bio: String(formData.get('bio') ?? '') || null,
      imageUrl: String(formData.get('imageUrl') ?? '') || null,
      expertise: String(formData.get('expertise') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      // Defaults to false: an AI byline must never imply first-hand testing.
      isHuman: formData.get('isHuman') === 'on',
      isActive: formData.get('isActive') === 'on',
      socialLinks: socialLinks as never,
    };

    if (id) await prisma.author.update({ where: { id }, data });
    else await prisma.author.create({ data: { ...data, slug: slugify(name) } });

    revalidatePath('/admin/authors');
    return { ok: true, message: id ? 'Author updated.' : 'Author created.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:saveAuthor', error: err }) };
  }
}

/* -------------------------------- affiliate ------------------------------ */

const affiliateSchema = z.object({
  merchant: z.string().min(1).max(80),
  domain: z.string().min(3).max(120),
  affiliateUrl: z.string().url().max(500),
  trackingId: z.string().max(120).optional(),
  urlTemplate: z.string().max(500).optional(),
  categories: z.array(z.string()).max(30),
  maxPerArticle: z.number().int().min(0).max(20),
  isActive: z.boolean(),
  disclosureText: z.string().max(600).optional(),
});

export async function saveAffiliateAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const id = String(formData.get('id') ?? '');
    const parsed = affiliateSchema.safeParse({
      merchant: formData.get('merchant'),
      domain: String(formData.get('domain') ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      affiliateUrl: formData.get('affiliateUrl'),
      trackingId: formData.get('trackingId') || undefined,
      urlTemplate: formData.get('urlTemplate') || undefined,
      categories: String(formData.get('categories') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      maxPerArticle: Number(formData.get('maxPerArticle')) || 3,
      isActive: formData.get('isActive') === 'on',
      disclosureText: formData.get('disclosureText') || undefined,
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };

    if (id) await prisma.affiliateLink.update({ where: { id }, data: parsed.data });
    else await prisma.affiliateLink.create({ data: parsed.data });

    revalidatePath('/admin/affiliate');
    return { ok: true, message: id ? 'Affiliate rule updated.' : 'Affiliate rule created.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:saveAffiliate', error: err }) };
  }
}

export async function deleteAffiliateAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    await prisma.affiliateLink.delete({ where: { id: String(formData.get('id') ?? '') } });
    revalidatePath('/admin/affiliate');
    return { ok: true, message: 'Affiliate rule deleted.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:deleteAffiliate', error: err }) };
  }
}

/* ------------------------------------ ads -------------------------------- */

export async function saveAdSlotAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const id = String(formData.get('id') ?? '');
    const placement = String(formData.get('placement') ?? '');
    const valid = ['BELOW_INTRO', 'MID_ARTICLE', 'END_ARTICLE', 'SIDEBAR', 'HOMEPAGE_INLINE'];
    if (!valid.includes(placement)) return { ok: false, message: 'Invalid placement.' };

    const data = {
      name: String(formData.get('name') ?? 'Default').slice(0, 80),
      placement: placement as never,
      isActive: formData.get('isActive') === 'on',
      adCode: String(formData.get('adCode') ?? '') || null,
      adClient: String(formData.get('adClient') ?? '') || null,
      adUnitId: String(formData.get('adUnitId') ?? '') || null,
      minWordCount: Number(formData.get('minWordCount')) || 0,
      categoryIds: String(formData.get('categoryIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    };

    if (id) await prisma.adSlot.update({ where: { id }, data });
    else await prisma.adSlot.create({ data });

    revalidatePath('/admin/ads');
    revalidatePath('/', 'layout');
    return { ok: true, message: id ? 'Ad slot updated.' : 'Ad slot created.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:saveAdSlot', error: err }) };
  }
}

export async function deleteAdSlotAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    await prisma.adSlot.delete({ where: { id: String(formData.get('id') ?? '') } });
    revalidatePath('/admin/ads');
    return { ok: true, message: 'Ad slot deleted.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:deleteAdSlot', error: err }) };
  }
}
