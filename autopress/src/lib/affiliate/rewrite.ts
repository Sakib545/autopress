import { prisma } from '../db';

export type AffiliateRule = {
  id: string;
  merchant: string;
  domain: string;
  affiliateUrl: string;
  trackingId: string | null;
  urlTemplate: string | null;
  maxPerArticle: number;
};

export async function loadRules(): Promise<AffiliateRule[]> {
  const rows = await prisma.affiliateLink.findMany({ where: { isActive: true } });
  return rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    domain: r.domain,
    affiliateUrl: r.affiliateUrl,
    trackingId: r.trackingId,
    urlTemplate: r.urlTemplate,
    maxPerArticle: r.maxPerArticle,
  }));
}

function buildTarget(rule: AffiliateRule, originalUrl: string) {
  if (rule.urlTemplate) {
    return rule.urlTemplate
      .replace('{url}', encodeURIComponent(originalUrl))
      .replace('{rawUrl}', originalUrl)
      .replace('{trackingId}', rule.trackingId ?? '');
  }
  if (rule.trackingId) {
    try {
      const u = new URL(originalUrl);
      u.searchParams.set('tag', rule.trackingId);
      return u.toString();
    } catch {
      return rule.affiliateUrl;
    }
  }
  return rule.affiliateUrl;
}

/**
 * Rewrites outbound links to configured merchants. Respects a per-merchant cap
 * so a single article can never be stuffed with affiliate links.
 */
export function applyAffiliateLinks(html: string, rules: AffiliateRule[]) {
  if (!rules.length) return { html, applied: [] as { ruleId: string; url: string; originalUrl: string }[] };

  const counts = new Map<string, number>();
  const applied: { ruleId: string; url: string; originalUrl: string }[] = [];

  const out = html.replace(/href="(https?:\/\/[^"]+)"/gi, (match, url: string) => {
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return match;
    }
    const rule = rules.find((r) => host === r.domain || host.endsWith(`.${r.domain}`));
    if (!rule) return match;

    const used = counts.get(rule.id) ?? 0;
    if (used >= rule.maxPerArticle) return match;
    counts.set(rule.id, used + 1);

    const target = buildTarget(rule, url);
    applied.push({ ruleId: rule.id, url: target, originalUrl: url });
    return `href="${target}" rel="sponsored noopener noreferrer" target="_blank"`;
  });

  return { html: out, applied };
}
