import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLMJson } from '../ai';
import { seoPrompt } from '../ai/prompts';
import { slugify, truncate } from '../utils';
import { env } from '../env';

type RawSeo = { seoTitle?: string; metaDesc?: string; ogTitle?: string; ogDesc?: string; excerpt?: string; tags?: string[] };

export async function generateSeo(articleId: string) {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { keywords: { include: { keyword: true } }, category: true },
  });
  if (!article?.contentMd) throw new Error(`Article ${articleId} has no content`);

  const primary = article.keywords.find((k) => k.role === 'PRIMARY')?.keyword.term ?? article.title;
  const prompt = seoPrompt(settings, { title: article.title, primaryKeyword: primary, content: article.contentMd });
  const { data } = await callLLMJson<RawSeo>({ ...prompt, articleId, essential: true, temperature: 0.4, maxTokens: 800 }, {});

  const categorySlug = article.category?.slug ?? 'articles';
  const seoTitle = truncate(data.seoTitle?.trim() || article.title, 60);
  const metaDesc = truncate(data.metaDesc?.trim() || `${article.title}.`, 158);

  await prisma.article.update({
    where: { id: articleId },
    data: {
      seoTitle,
      metaDesc,
      ogTitle: truncate(data.ogTitle?.trim() || seoTitle, 70),
      ogDesc: truncate(data.ogDesc?.trim() || metaDesc, 160),
      excerpt: truncate(data.excerpt?.trim() || metaDesc, 300),
      canonicalUrl: `${env.siteUrl}/${categorySlug}/${article.slug}`,
      isIndexable: true,
    },
  });

  // Tags stay deliberately shallow: a small shared vocabulary, not one tag per article.
  const tags = (data.tags ?? []).map((t) => t.toLowerCase().trim()).filter((t) => t.length > 2).slice(0, 5);
  for (const name of tags) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({ where: { slug }, create: { name, slug }, update: {} });
    await prisma.articleTag
      .upsert({ where: { articleId_tagId: { articleId, tagId: tag.id } }, create: { articleId, tagId: tag.id }, update: {} })
      .catch(() => undefined);
  }

  // Recount tags and flip indexability for any that clear the threshold.
  for (const name of tags) {
    const slug = slugify(name);
    const count = await prisma.articleTag.count({ where: { tag: { slug } } });
    await prisma.tag.update({
      where: { slug },
      data: { articleCount: count, isIndexable: count >= settings.tagIndexThreshold },
    });
  }

  return { seoTitle, metaDesc, tags };
}
