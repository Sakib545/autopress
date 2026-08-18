import type { ContentType, FreshnessTier } from '@prisma/client';

/** How long an article may sit before the refresh scanner looks at it again. */
export const CHECK_INTERVAL_DAYS: Record<FreshnessTier, number> = {
  VOLATILE: 21,
  STANDARD: 90,
  EVERGREEN: 240,
  DATED: 365,
};

export function tierFor(contentType: ContentType, hasVolatileFacts: boolean): FreshnessTier {
  if (contentType === 'NEWS') return 'DATED';
  if (hasVolatileFacts) return 'VOLATILE';
  if (['BEST_OF', 'COMPARISON', 'ALTERNATIVES', 'REVIEW'].includes(contentType)) return 'VOLATILE';
  if (['TUTORIAL', 'GLOSSARY', 'EXPLAINER'].includes(contentType)) return 'EVERGREEN';
  return 'STANDARD';
}

export function nextCheckDate(tier: FreshnessTier, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + CHECK_INTERVAL_DAYS[tier]);
  return d;
}

/** Cheap signals that justify spending a model call on a full staleness diff. */
export function staleSignals(opts: {
  content: string;
  publishedAt: Date | null;
  brokenLinkCount: number;
  metrics?: { impressions: number; clicks: number; avgPosition: number | null } | null;
}) {
  const reasons: string[] = [];
  const now = new Date();
  const year = now.getFullYear();

  const years = opts.content.match(/\b(20\d{2})\b/g) ?? [];
  if (years.some((y) => Number(y) < year - 1)) reasons.push('References a year more than one cycle old');

  if (/\$\d/.test(opts.content)) reasons.push('Contains explicit pricing that may have moved');
  if (opts.brokenLinkCount > 0) reasons.push(`${opts.brokenLinkCount} broken outbound link(s)`);

  if (opts.publishedAt) {
    const ageDays = (now.getTime() - opts.publishedAt.getTime()) / 86_400_000;
    if (ageDays > 365) reasons.push('Older than twelve months');
  }

  const m = opts.metrics;
  if (m) {
    if (m.impressions > 500 && m.clicks / Math.max(1, m.impressions) < 0.01) reasons.push('High impressions, low CTR — title and meta need work');
    if (m.avgPosition !== null && m.avgPosition >= 8 && m.avgPosition <= 20) reasons.push('Ranking 8-20 — within striking distance');
    if (m.impressions === 0) reasons.push('No impressions recorded — review or consolidate');
  }

  return reasons;
}
