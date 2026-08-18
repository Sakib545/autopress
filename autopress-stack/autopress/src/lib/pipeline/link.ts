import { prisma } from '../db';
import { getSettings } from '../settings';
import { markdownToHtml, addHeadingIds, extractExternalLinks, extractFaqs } from '../content/markdown';
import { findLinkCandidates, injectInternalLinks } from '../content/internal-links';
import { loadRules, applyAffiliateLinks } from '../affiliate/rewrite';

/**
 * Renders markdown to sanitized HTML, then layers on internal links and
 * affiliate rewrites. This is the last stage that touches the body text.
 */
export async function buildFinalHtml(articleId: string) {
  const settings = await getSettings();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { keywords: { include: { keyword: true } } },
  });
  if (!article?.contentMd) throw new Error(`Article ${articleId} has no content`);

  const baseHtml = markdownToHtml(article.contentMd);
  const withIds = addHeadingIds(baseHtml);

  const candidates = await findLinkCandidates({
    excludeArticleId: articleId,
    embedding: article.embedding,
    keywords: article.keywords.map((k) => k.keyword.normalizedTerm),
    clusterId: article.clusterId,
    limit: 10,
  });

  const linked = injectInternalLinks(withIds.html, candidates, {
    wordCount: article.wordCount,
    maxPer1000Words: settings.maxInternalLinksPer1000Words,
  });

  const rules = await loadRules();
  const affiliated = applyAffiliateLinks(linked.html, rules);

  // Persist internal link records (unique index makes re-runs harmless).
  await prisma.internalLink.deleteMany({ where: { fromArticleId: articleId, isAutomatic: true } });
  for (const link of linked.inserted) {
    await prisma.internalLink
      .create({
        data: {
          fromArticleId: articleId,
          toArticleId: link.articleId,
          anchorText: link.anchorText,
          anchorHash: link.anchorHash,
          isAutomatic: true,
        },
      })
      .catch(() => undefined);
  }

  // Persist outbound links for the broken-link checker.
  await prisma.externalLink.deleteMany({ where: { articleId } });
  for (const ext of extractExternalLinks(affiliated.html)) {
    let domain = 'unknown';
    try {
      domain = new URL(ext.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    const affiliateHit = affiliated.applied.find((a) => a.url === ext.url);
    await prisma.externalLink.create({
      data: {
        articleId,
        url: ext.url,
        domain,
        anchorText: ext.anchorText.slice(0, 300),
        isAffiliate: Boolean(affiliateHit),
        affiliateLinkId: affiliateHit?.ruleId ?? null,
      },
    });
  }

  const faqs = extractFaqs(affiliated.html);

  await prisma.article.update({
    where: { id: articleId },
    data: {
      contentHtml: affiliated.html,
      blocks: { headings: withIds.headings, faqs } as never,
      hasVisibleFaq: faqs.length > 0,
      hasAffiliateLinks: affiliated.applied.length > 0,
    },
  });

  return { internalLinks: linked.inserted.length, externalLinks: extractExternalLinks(affiliated.html).length, affiliateLinks: affiliated.applied.length, faqs: faqs.length };
}
