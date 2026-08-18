import { prisma } from '../db';
import { getSettings } from '../settings';
import { logError, notify } from '../logging';
import { buildResearch } from './research';
import { createArticleForTopic, draftArticle, rewriteArticle } from './draft';
import { reviewArticle } from './review';
import { generateSeo } from './seo';
import { buildFinalHtml } from './link';
import { assignFeaturedImage } from './image';
import { scheduleArticle } from './publish';

export * from './discover';
export * from './research';
export * from './draft';
export * from './review';
export * from './seo';
export * from './link';
export * from './image';
export * from './publish';
export * from './refresh';
export * from './linkcheck';
export * from './article-video';

export type PipelineResult = {
  topicId: string;
  articleId?: string;
  status: 'PUBLISHED_QUEUE' | 'MANUAL_REVIEW' | 'FAILED';
  qualityScore?: number;
  scheduledFor?: Date;
  steps: string[];
  error?: string;
};

/**
 * Runs one topic all the way to a scheduled article. Each stage persists its
 * own state, so this can also be resumed stage-by-stage by the queue workers.
 * Used directly by the admin "generate now" action when Redis is absent.
 */
export async function runArticlePipeline(topicId: string): Promise<PipelineResult> {
  const settings = await getSettings();
  const steps: string[] = [];
  let articleId: string | undefined;

  try {
    const research = await buildResearch(topicId);
    steps.push(`research: ${research.sourceCount} sources, ${research.factCount} facts`);
    if (!research.sufficient) {
      await prisma.topic.update({ where: { id: topicId }, data: { status: 'REJECTED', rejectionReason: 'Insufficient research' } });
      return { topicId, status: 'MANUAL_REVIEW', steps, error: 'Research insufficient — no article written.' };
    }

    const article = await createArticleForTopic(topicId);
    articleId = article.id;
    steps.push(`article created: ${article.slug}`);

    await draftArticle(article.id);
    steps.push('draft written');

    let attempt = 1;
    for (;;) {
      const review = await reviewArticle(article.id, attempt);
      steps.push(`review ${attempt}: ${review.score}/${settings.minQualityScore}`);

      if (review.action === 'PROCEED') break;
      if (review.action === 'MANUAL_REVIEW') {
        return { topicId, articleId: article.id, status: 'MANUAL_REVIEW', qualityScore: review.score, steps };
      }
      attempt++;
      await rewriteArticle(article.id, attempt);
      steps.push(`rewrite ${attempt - 1}`);
    }

    await generateSeo(article.id);
    steps.push('seo metadata');

    const links = await buildFinalHtml(article.id);
    steps.push(`links: ${links.internalLinks} internal, ${links.affiliateLinks} affiliate`);

    const image = await assignFeaturedImage(article.id);
    steps.push(`image: ${image.source ?? 'reused'}`);

    await prisma.article.update({ where: { id: article.id }, data: { status: 'READY' } });
    const scheduled = await scheduleArticle(article.id);
    steps.push(`scheduled for ${scheduled.scheduledFor.toISOString()}`);

    const final = await prisma.article.findUnique({ where: { id: article.id }, select: { qualityScore: true } });
    return {
      topicId,
      articleId: article.id,
      status: 'PUBLISHED_QUEUE',
      qualityScore: final?.qualityScore,
      scheduledFor: scheduled.scheduledFor,
      steps,
    };
  } catch (err) {
    const message = await logError({ scope: 'pipeline', error: err, entityType: 'topic', entityId: topicId, context: { steps } });
    if (articleId) {
      await prisma.article.update({ where: { id: articleId }, data: { status: 'FAILED', failureReason: message } }).catch(() => undefined);
    }
    await notify({ level: 'ERROR', title: 'Article pipeline failed', message, entityType: 'topic', entityId: topicId });
    return { topicId, articleId, status: 'FAILED', steps, error: message };
  }
}
