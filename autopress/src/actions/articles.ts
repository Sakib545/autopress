'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { logError, notify } from '@/lib/logging';
import { triggerVideoForPublishedArticle } from '@/lib/pipeline/publish';
import { scheduleArticle, refreshArticle, reviewArticle, rewriteArticle, generateSeo, buildFinalHtml, assignFeaturedImage } from '@/lib/pipeline';
import { revalidateArticle } from '@/lib/revalidate';
import { countWords, readingTimeMinutes } from '@/lib/utils';
import type { ActionState } from './topics';

const idSchema = z.object({ id: z.string().min(1) });

function flushArticle(categorySlug: string | undefined, slug: string) {
  revalidatePath('/admin/articles');
  revalidatePath('/admin');
  return revalidateArticle(categorySlug ?? 'articles', slug);
}

export async function publishNowAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const settings = await getSettings();

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, slug: true, title: true, status: true, qualityScore: true, factCheckPass: true, category: { select: { slug: true } } },
    });
    if (!article) return { ok: false, message: 'Article not found.' };
    if (article.status === 'PUBLISHED') return { ok: false, message: 'Already published.' };

    const force = formData.get('force') === 'true';
    if (article.qualityScore < settings.minQualityScore && !force) {
      return { ok: false, message: `Score ${article.qualityScore} is below the minimum of ${settings.minQualityScore}. Re-run review or publish with override.` };
    }
    if (!article.factCheckPass && !force) {
      return { ok: false, message: 'Fact check is incomplete. Re-run review before publishing.' };
    }

    await prisma.$transaction([
      prisma.article.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), updatedContentAt: new Date() },
      }),
      prisma.publishingJob.updateMany({ where: { articleId: id, status: 'PENDING' }, data: { status: 'COMPLETED', publishedAt: new Date() } }),
    ]);

    await notify({ level: 'SUCCESS', title: `Published: ${article.title}`, entityType: 'article', entityId: id });
    await flushArticle(article.category?.slug, article.slug);

    // Video is a post-publish side effect. It cannot fail the publish.
    let videoNote = '';
    try {
      const video = await triggerVideoForPublishedArticle(id);
      videoNote = video.skipped ? '' : ' Short-form video queued.';
    } catch { /* video is a post-publish side effect — log but don't fail */ }
    return { ok: true, message: `Published.${videoNote}` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:publishNow', error: err }) };
  }
}

export async function unpublishAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const article = await prisma.article.update({
      where: { id },
      data: { status: 'MANUAL_REVIEW', publishedAt: null },
      select: { slug: true, category: { select: { slug: true } } },
    });
    await flushArticle(article.category?.slug, article.slug);
    return { ok: true, message: 'Unpublished and moved to manual review.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:unpublish', error: err }) };
  }
}

export async function scheduleAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const result = await scheduleArticle(id);
    revalidatePath('/admin/queue');
    revalidatePath('/admin/articles');
    return { ok: true, message: `Scheduled for ${result.scheduledFor.toLocaleString()}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:schedule', error: err }) };
  }
}

/** Re-scores an article and rewrites it once if it fails, mirroring the worker. */
export async function rerunReviewAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const settings = await getSettings();

    const current = await prisma.article.findUnique({ where: { id }, select: { rewriteCount: true } });
    let attempt = (current?.rewriteCount ?? 0) + 1;
    let outcome = await reviewArticle(id, attempt);

    while (outcome.action === 'REWRITE' && attempt <= settings.maxRewriteAttempts) {
      attempt++;
      await rewriteArticle(id, attempt);
      outcome = await reviewArticle(id, attempt);
    }

    revalidatePath('/admin/articles');
    revalidatePath(`/admin/articles/${id}`);
    return {
      ok: outcome.action !== 'MANUAL_REVIEW',
      message: `Score ${outcome.score}/${settings.minQualityScore} after ${attempt} pass${attempt === 1 ? '' : 'es'} — ${outcome.action.replace('_', ' ').toLowerCase()}.`,
    };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:rerunReview', error: err }) };
  }
}

/** Re-runs the post-writing stages without regenerating the body. */
export async function rebuildOutputAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    await generateSeo(id);
    const links = await buildFinalHtml(id);
    const image = await assignFeaturedImage(id);
    const article = await prisma.article.findUnique({ where: { id }, select: { slug: true, category: { select: { slug: true } } } });
    if (article) await flushArticle(article.category?.slug, article.slug);
    revalidatePath(`/admin/articles/${id}`);
    return { ok: true, message: `Rebuilt: ${links.internalLinks} internal links, ${links.affiliateLinks} affiliate links, image ${image.source ?? 'unchanged'}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:rebuildOutput', error: err }) };
  }
}

export async function refreshArticleAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const result = await refreshArticle(id);
    revalidatePath(`/admin/articles/${id}`);
    revalidatePath('/admin/articles');
    return { ok: true, message: result.updated ? `Updated: ${result.reason}` : `No material changes found. ${result.reason}` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:refreshArticle', error: err }) };
  }
}

const editSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(5).max(200),
  subtitle: z.string().max(300).nullable(),
  excerpt: z.string().max(600).nullable(),
  seoTitle: z.string().max(70).nullable(),
  metaDesc: z.string().max(200).nullable(),
  isPinned: z.boolean(),
  isIndexable: z.boolean(),
  sponsorship: z.enum(['NONE', 'SPONSORED', 'PAID_PARTNERSHIP', 'ADVERTISEMENT']),
  sponsorName: z.string().max(120).nullable(),
  contentMd: z.string().min(200).max(50000),
});

export async function updateArticleAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const parsed = editSchema.safeParse({
      id: formData.get('id'),
      title: formData.get('title'),
      subtitle: formData.get('subtitle') ? String(formData.get('subtitle')) : null,
      excerpt: formData.get('excerpt') ? String(formData.get('excerpt')) : null,
      seoTitle: formData.get('seoTitle') ? String(formData.get('seoTitle')) : null,
      metaDesc: formData.get('metaDesc') ? String(formData.get('metaDesc')) : null,
      isPinned: formData.get('isPinned') === 'on',
      isIndexable: formData.get('isIndexable') === 'on',
      sponsorship: formData.get('sponsorship') || 'NONE',
      sponsorName: formData.get('sponsorName') ? String(formData.get('sponsorName')) : null,
      contentMd: String(formData.get('contentMd') ?? ''),
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };

    const { id, contentMd, ...data } = parsed.data;
    const current = await prisma.article.findUnique({ where: { id }, select: { contentMd: true } });
    if (!current) return { ok: false, message: 'Article not found.' };
    const words = countWords(contentMd);
    const latest = await prisma.articleRevision.aggregate({ where: { articleId: id }, _max: { version: true } });
    const [article] = await prisma.$transaction([
      prisma.article.update({
        where: { id },
        data: {
          ...data,
          contentMd,
          contentHtml: null,
          wordCount: words,
          readingTime: readingTimeMinutes(words),
          status: 'MANUAL_REVIEW',
          factCheckPass: false,
          qualityScore: 0,
          updatedContentAt: new Date(),
        },
        select: { slug: true, category: { select: { slug: true } } },
      }),
      prisma.articleRevision.create({
        data: {
          articleId: id,
          version: (latest._max.version ?? 0) + 1,
          reason: 'MANUAL_EDIT',
          summary: 'Body edited from the admin dashboard.',
          contentBefore: current.contentMd,
          contentAfter: contentMd,
        },
      }),
    ]);
    await flushArticle(article.category?.slug, article.slug);
    revalidatePath(`/admin/articles/${id}`);
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:updateArticle', error: err }) };
  }
}

export async function archiveArticleAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const { id } = idSchema.parse({ id: formData.get('id') });
    const article = await prisma.article.update({
      where: { id },
      data: { status: 'ARCHIVED', isIndexable: false },
      select: { slug: true, category: { select: { slug: true } } },
    });
    await flushArticle(article.category?.slug, article.slug);
    return { ok: true, message: 'Archived and set to noindex. Content is retained.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:archive', error: err }) };
  }
}
