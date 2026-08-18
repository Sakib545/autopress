import { prisma } from '../db';
import { generateCover } from '../images';
import { logError } from '../logging';

/** Featured image is never allowed to block publication. */
export async function assignFeaturedImage(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { category: true, featuredMedia: true },
  });
  if (!article) throw new Error(`Article ${articleId} not found`);
  if (article.featuredMediaId) return { mediaId: article.featuredMediaId, reused: true, source: article.featuredMedia?.source ?? null };

  let image;
  try {
    image = await generateCover({
      title: article.title,
      slug: article.slug,
      category: article.category?.name,
      width: 1200,
      height: 630,
    });
  } catch (err) {
    await logError({ scope: 'article.image', error: err, entityType: 'article', entityId: articleId });
    image = {
      url: `/api/cover/${encodeURIComponent(article.slug)}`,
      altText: `Cover illustration for "${article.title}"`,
      width: 1200,
      height: 630,
      source: 'FALLBACK' as const,
      license: 'Generated in-house',
      costUsd: 0,
    };
  }

  const media = await prisma.media.create({
    data: {
      articleId,
      url: image.url,
      altText: image.altText,
      width: image.width,
      height: image.height,
      source: image.source,
      sourceUrl: image.sourceUrl ?? null,
      license: image.license ?? null,
      attribution: image.attribution ?? null,
      prompt: image.prompt ?? null,
      mimeType: image.mimeType ?? null,
      generationCost: image.costUsd ?? 0,
    },
  });

  await prisma.article.update({ where: { id: articleId }, data: { featuredMediaId: media.id } });
  return { mediaId: media.id, reused: false, source: image.source as string | null };
}
