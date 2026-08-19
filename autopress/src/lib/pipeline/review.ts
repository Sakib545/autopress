import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLMJson } from '../ai';
import { qualityReviewPrompt } from '../ai/prompts';
import { normalizeCard, totalScore, hardChecks, type ScoreCard } from '../content/scoring';
import { researchDigest } from './research';
import { notify } from '../logging';

type RawReview = Partial<ScoreCard> & { weakSections?: string[]; feedback?: string; unverifiedClaims?: string[] };

export type ReviewOutcome = {
  score: number;
  passed: boolean;
  action: 'PROCEED' | 'REWRITE' | 'MANUAL_REVIEW';
  weakSections: string[];
  feedback: string;
};

export async function reviewArticle(articleId: string, attempt: number): Promise<ReviewOutcome> {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { author: true },
  });
  if (!article?.contentMd || !article.topicId) throw new Error(`Article ${articleId} has no draft to review`);

  await prisma.article.update({ where: { id: articleId }, data: { status: 'REVIEWING' } });

  const digest = await researchDigest(article.topicId);
  const prompt = qualityReviewPrompt(settings, {
    title: article.title,
    intent: article.intent,
    content: article.contentMd,
    research: digest.text,
    attempt,
  });

  const { data } = await callLLMJson<RawReview>({ ...prompt, articleId, essential: true, temperature: 0.1, maxTokens: 2000 }, {});

  const card = normalizeCard(data);
  let score = totalScore(card);

  // Deterministic gates the reviewer model cannot override.
  const failures = hardChecks(article.contentMd, {
    minWords: settings.articleMinWords,
    maxWords: settings.articleMaxWords,
    wordCount: article.wordCount,
    authorIsHuman: article.author?.isHuman ?? false,
  });
  const unverified = Array.isArray(data.unverifiedClaims) ? data.unverifiedClaims : [];
  if (failures.length) score = Math.min(score, 60);
  if (unverified.length > 3) score = Math.min(score, 65);

  const weakSections = Array.isArray(data.weakSections) ? data.weakSections : [];
  const feedback = [data.feedback ?? '', ...failures.map((f) => `Hard check: ${f}`)].filter(Boolean).join(' | ');
  const factCheckPass = unverified.length === 0 && failures.length === 0;
  const passed = score >= settings.minQualityScore && factCheckPass;

  await prisma.qualityReview.upsert({
    where: { articleId_attempt: { articleId, attempt } },
    create: {
      articleId,
      attempt,
      ...card,
      totalScore: score,
      passed,
      weakSections,
      feedback: feedback.slice(0, 4000),
      unverifiedClaims: unverified as never,
      reviewerModel: 'quality-review',
    },
    update: { ...card, totalScore: score, passed, weakSections, feedback: feedback.slice(0, 4000) },
  });

  await prisma.article.update({
    where: { id: articleId },
    data: { qualityScore: score, factCheckPass },
  });

  if (passed) return { score, passed, action: 'PROCEED', weakSections, feedback };

  if (attempt >= settings.maxRewriteAttempts + 1) {
    await prisma.article.update({
      where: { id: articleId },
      data: { status: 'MANUAL_REVIEW', failureReason: `Scored ${score} after ${attempt} attempts (minimum ${settings.minQualityScore}).` },
    });
    await notify({
      level: 'WARNING',
      title: `Manual review needed: ${article.title}`,
      message: `Scored ${score}/${settings.minQualityScore} after ${attempt} attempts.`,
      entityType: 'article',
      entityId: articleId,
    });
    return { score, passed: false, action: 'MANUAL_REVIEW', weakSections, feedback };
  }

  return { score, passed: false, action: 'REWRITE', weakSections, feedback };
}
