import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLM, embedText } from '../ai';
import { articleWritingPrompt, rewritePrompt } from '../ai/prompts';
import { sectionsFor, templateHasFaq } from '../content/templates';
import { researchDigest } from './research';
import { uniqueArticleSlug } from '../seo/slug';
import { countWords, readingTimeMinutes } from '../utils';
import { tierFor } from '../content/freshness';

/** Creates the Article shell for an approved topic (idempotent per topic). */
export async function createArticleForTopic(topicId: string) {
  const existing = await prisma.article.findUnique({ where: { topicId } });
  if (existing) return existing;

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { keywords: { include: { keyword: true } } },
  });
  if (!topic) throw new Error(`Topic ${topicId} not found`);

  const slug = await uniqueArticleSlug(topic.title);
  const article = await prisma.article.create({
    data: {
      topicId: topic.id,
      title: topic.title,
      slug,
      status: 'RESEARCHING',
      contentType: topic.contentType,
      intent: topic.intent,
      categoryId: topic.categoryId,
      clusterId: topic.clusterId,
      embedding: topic.embedding,
    },
  });

  for (const tk of topic.keywords) {
    await prisma.articleKeyword.upsert({
      where: { articleId_keywordId: { articleId: article.id, keywordId: tk.keywordId } },
      create: { articleId: article.id, keywordId: tk.keywordId, role: tk.role },
      update: {},
    });
  }

  await prisma.topic.update({ where: { id: topic.id }, data: { status: 'WRITING' } });
  return article;
}

export async function draftArticle(articleId: string) {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { topic: true, keywords: { include: { keyword: true } } },
  });
  if (!article) throw new Error(`Article ${articleId} not found`);
  if (!article.topicId) throw new Error(`Article ${articleId} has no topic`);

  const research = await prisma.research.findUnique({ where: { topicId: article.topicId } });
  if (!research?.isSufficient) {
    await prisma.article.update({
      where: { id: articleId },
      data: { status: 'MANUAL_REVIEW', failureReason: 'Research was insufficient — refusing to write unsupported content.' },
    });
    throw new Error('Research insufficient; article not drafted.');
  }

  await prisma.article.update({ where: { id: articleId }, data: { status: 'DRAFTING' } });

  const digest = await researchDigest(article.topicId);
  const targetWords = Math.round((settings.articleMinWords + settings.articleMaxWords) / 2);
  const sections = sectionsFor(article.contentType, targetWords);
  const primary = article.keywords.find((k) => k.role === 'PRIMARY')?.keyword.term ?? article.title;
  const secondary = article.keywords.filter((k) => k.role !== 'PRIMARY').map((k) => k.keyword.term);

  const prompt = articleWritingPrompt(settings, {
    title: article.title,
    angle: article.topic?.angle ?? '',
    intent: article.intent,
    contentType: article.contentType,
    sections,
    primaryKeyword: primary,
    secondaryKeywords: secondary,
    research: digest.text,
    targetWords,
  });

  const result = await callLLM({ ...prompt, articleId, essential: true, temperature: 0.7, maxTokens: 8000 });
  const md = result.text.trim();
  const words = countWords(md);

  await prisma.article.update({
    where: { id: articleId },
    data: {
      contentMd: md,
      wordCount: words,
      readingTime: readingTimeMinutes(words),
      status: 'REVIEWING',
      hasVisibleFaq: templateHasFaq(article.contentType, targetWords) && /##\s*FAQ/i.test(md),
      freshnessTier: tierFor(article.contentType, digest.hasVolatile),
      embedding: await embedText(`${article.title}\n${md.slice(0, 2000)}`),
      failureReason: null,
    },
  });

  // Attribute the sources this article was built from.
  for (const sourceId of digest.sourceIds) {
    await prisma.articleSource
      .upsert({
        where: { articleId_sourceId: { articleId, sourceId } },
        create: { articleId, sourceId, usedFor: 'body' },
        update: {},
      })
      .catch(() => undefined);
  }

  await prisma.articleRevision.create({
    data: {
      articleId,
      version: 1,
      reason: 'INITIAL',
      summary: 'First draft generated from research.',
      contentAfter: md,
      aiProvider: result.provider,
      aiModel: result.model,
    },
  });

  return { wordCount: words };
}

export async function rewriteArticle(articleId: string, attempt: number) {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { reviews: { orderBy: { attempt: 'desc' }, take: 1 } },
  });
  if (!article?.contentMd || !article.topicId) throw new Error(`Article ${articleId} is not drafted`);

  await prisma.article.update({ where: { id: articleId }, data: { status: 'REWRITING' } });

  const lastReview = article.reviews[0];
  const digest = await researchDigest(article.topicId);

  const prompt = rewritePrompt(settings, {
    title: article.title,
    weakSections: lastReview?.weakSections ?? [],
    feedback: lastReview?.feedback ?? 'Improve accuracy, usefulness and structure.',
    content: article.contentMd,
    research: digest.text,
    attempt,
  });

  const result = await callLLM({ ...prompt, articleId, essential: true, temperature: 0.55, maxTokens: 8000 });
  const md = result.text.trim();
  const words = countWords(md);

  const lastVersion = await prisma.articleRevision.aggregate({ where: { articleId }, _max: { version: true } });
  await prisma.articleRevision.create({
    data: {
      articleId,
      version: (lastVersion._max.version ?? 1) + 1,
      reason: 'QUALITY_REWRITE',
      summary: `Rewrite attempt ${attempt} after quality review.`,
      changedSections: lastReview?.weakSections ?? [],
      contentBefore: article.contentMd,
      contentAfter: md,
      qualityBefore: lastReview?.totalScore ?? null,
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
      rewriteCount: { increment: 1 },
      status: 'REVIEWING',
    },
  });

  return { wordCount: words };
}
