import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLM, callLLMJson } from '../ai';
import { refreshDiffPrompt, rewritePrompt } from '../ai/prompts';
import { staleSignals, nextCheckDate } from '../content/freshness';
import { buildResearch, researchDigest } from './research';
import { buildFinalHtml } from './link';
import { countWords, readingTimeMinutes } from '../utils';
import { notify } from '../logging';
import { revalidateArticle } from '../revalidate';

/** Cheap pass: finds articles worth spending a model call on. */
export async function scanForStaleArticles(limit = 20) {
  const now = new Date();
  const candidates = await prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      isSample: false,
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
    },
    include: {
      externalLinks: { where: { status: 'BROKEN' }, select: { id: true } },
      metrics: { orderBy: { date: 'desc' }, take: 7 },
    },
    orderBy: [{ nextCheckAt: 'asc' }, { publishedAt: 'asc' }],
    take: limit,
  });

  const flagged: { articleId: string; title: string; reasons: string[] }[] = [];
  for (const a of candidates) {
    const metrics = a.metrics.length
      ? {
          impressions: a.metrics.reduce((n, m) => n + m.impressions, 0),
          clicks: a.metrics.reduce((n, m) => n + m.clicks, 0),
          avgPosition: a.metrics[0].avgPosition,
        }
      : null;

    const reasons = staleSignals({
      content: a.contentMd ?? '',
      publishedAt: a.publishedAt,
      brokenLinkCount: a.externalLinks.length,
      metrics,
    });

    if (reasons.length) {
      flagged.push({ articleId: a.id, title: a.title, reasons });
    } else {
      // Nothing to do — push the next check out by the tier interval.
      await prisma.article.update({
        where: { id: a.id },
        data: { lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(a.freshnessTier) },
      });
    }
  }
  return flagged;
}

/** Expensive pass: re-research, diff, and rewrite only if genuinely stale. */
export async function refreshArticle(articleId: string) {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { category: true },
  });
  if (!article?.contentMd || !article.topicId) throw new Error(`Article ${articleId} cannot be refreshed`);

  // News is recorded, not endlessly rewritten.
  if (article.freshnessTier === 'DATED') {
    await prisma.article.update({
      where: { id: articleId },
      data: { lastCheckedAt: new Date(), nextCheckAt: nextCheckDate('DATED') },
    });
    return { updated: false, reason: 'Dated content is not rewritten.' };
  }

  await buildResearch(article.topicId);
  const digest = await researchDigest(article.topicId);

  const diffPrompt = refreshDiffPrompt({
    title: article.title,
    content: article.contentMd,
    freshFacts: digest.text,
    publishedAt: article.publishedAt?.toISOString() ?? 'unknown',
  });

  const { data: diff } = await callLLMJson<{ needsUpdate?: boolean; severity?: string; reasons?: string[]; changedSections?: string[] }>(
    { ...diffPrompt, articleId, temperature: 0.1, maxTokens: 1200 },
    { needsUpdate: false },
  );

  if (!diff.needsUpdate) {
    await prisma.article.update({
      where: { id: articleId },
      data: { lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(article.freshnessTier) },
    });
    return { updated: false, reason: 'No material change detected.' };
  }

  const prompt = rewritePrompt(settings, {
    title: article.title,
    weakSections: diff.changedSections ?? [],
    feedback: `Update for accuracy. Reasons: ${(diff.reasons ?? []).join('; ')}`,
    content: article.contentMd,
    research: digest.text,
    attempt: 1,
  });

  const result = await callLLM({ ...prompt, articleId, essential: true, temperature: 0.4, maxTokens: 8000 });
  const md = result.text.trim();
  const words = countWords(md);

  const lastVersion = await prisma.articleRevision.aggregate({ where: { articleId }, _max: { version: true } });
  await prisma.articleRevision.create({
    data: {
      articleId,
      version: (lastVersion._max.version ?? 1) + 1,
      reason: 'FRESHNESS_UPDATE',
      summary: (diff.reasons ?? []).join('; ').slice(0, 1000) || 'Scheduled freshness update.',
      changedSections: diff.changedSections ?? [],
      contentBefore: article.contentMd,
      contentAfter: md,
      aiProvider: result.provider,
      aiModel: result.model,
    },
  });

  await prisma.article.update({
    where: { id: articleId },
    data: {
      contentMd: md,
      wordCount: words,
      readingTime: readingTimeMinutes(words),
      updatedContentAt: new Date(),
      lastCheckedAt: new Date(),
      nextCheckAt: nextCheckDate(article.freshnessTier),
    },
  });

  await buildFinalHtml(articleId);
  await revalidateArticle(article.category?.slug ?? 'articles', article.slug);
  await notify({ level: 'INFO', title: `Refreshed: ${article.title}`, message: (diff.reasons ?? []).join('; '), entityType: 'article', entityId: articleId });

  return { updated: true, reason: (diff.reasons ?? []).join('; ') || 'Content updated against fresh research.' };
}
