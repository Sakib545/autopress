import Link from 'next/link';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { truncate, formatDate } from '@/lib/utils';
import { PageHeader, TableWrap, StatCard } from '@/components/admin/stat-card';
import { Th, Td, Section } from '@/components/admin/form-fields';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

/**
 * Performance rules the refresh engine acts on once Search Console data exists.
 * Shown here so the thresholds are visible rather than buried in code.
 */
const RULES = [
  { when: 'Impressions high, CTR below 2%', then: 'Regenerate title and meta description only.' },
  { when: 'Average position between 8 and 20', then: 'Expand the article and strengthen internal links.' },
  { when: 'Clicks declining month over month', then: 'Full freshness refresh against new research.' },
  { when: 'No impressions for 90 days', then: 'Flag for human review or consolidation — never auto-deleted.' },
];

export default async function AnalyticsPage() {
  const [metricCount, topViewed, recentMetrics, published] = await Promise.all([
    prisma.articleMetric.count(),
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { viewCount: 'desc' }, take: 15,
      select: { id: true, title: true, viewCount: true, qualityScore: true, publishedAt: true, updatedContentAt: true },
    }),
    prisma.articleMetric.findMany({
      orderBy: { date: 'desc' }, take: 20,
      include: { article: { select: { title: true } } },
    }),
    prisma.article.count({ where: { status: 'PUBLISHED' } }),
  ]);

  const totalViews = topViewed.reduce((n, a) => n + a.viewCount, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Internal view counts are tracked out of the box. Search Console and GA4 metrics populate the performance table once their credentials are added."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Published articles" value={published} />
        <StatCard label="Tracked views" value={totalViews} />
        <StatCard label="External metric rows" value={metricCount} />
        <StatCard label="GA4" value={env.gaId ? 'connected' : 'not set'} tone={env.gaId ? 'success' : 'default'} />
      </div>

      {metricCount === 0 && (
        <div className="card mb-6 border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-300">No external analytics connected</p>
          <p className="mt-1 text-amber-800 dark:text-amber-400">
            Set <code>ANALYTICS_ID</code> for GA4 tracking, and add Search Console credentials to populate impressions,
            CTR and position. Until then the table below shows first-party view counts only — these are real, but they
            are not search data.
          </p>
        </div>
      )}

      <h2 className="mb-3 font-serif text-lg">Most viewed</h2>
      {topViewed.length === 0 ? (
        <div className="card p-5 text-sm text-ink-500">No published articles yet.</div>
      ) : (
        <TableWrap>
          <thead><tr><Th>Article</Th><Th>Views</Th><Th>Score</Th><Th>Published</Th><Th>Last refreshed</Th></tr></thead>
          <tbody>
            {topViewed.map((a) => (
              <tr key={a.id}>
                <Td><Link href={`/admin/articles/${a.id}`} className="hover:text-accent-600">{truncate(a.title, 60)}</Link></Td>
                <Td className="font-medium">{a.viewCount}</Td>
                <Td className="text-ink-500">{a.qualityScore}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(a.publishedAt, { dateStyle: 'medium' })}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(a.updatedContentAt, { dateStyle: 'medium' }) || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {recentMetrics.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-serif text-lg">Search performance</h2>
          <TableWrap>
            <thead><tr><Th>Article</Th><Th>Date</Th><Th>Impressions</Th><Th>Clicks</Th><Th>CTR</Th><Th>Position</Th></tr></thead>
            <tbody>
              {recentMetrics.map((m) => (
                <tr key={m.id}>
                  <Td>{truncate(m.article.title, 50)}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(m.date, { dateStyle: 'short' })}</Td>
                  <Td>{m.impressions.toLocaleString()}</Td>
                  <Td>{m.clicks.toLocaleString()}</Td>
                  <Td>{(m.ctr * 100).toFixed(2)}%</Td>
                  <Td>{m.avgPosition?.toFixed(1) ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      <Section title="Performance-based refresh rules" description="Applied by the freshness scan when search metrics are available." className="mt-8">
        <ul className="space-y-3 text-sm">
          {RULES.map((r) => (
            <li key={r.when} className="flex flex-col gap-1 border-b rule pb-3 last:border-0 last:pb-0 sm:flex-row sm:gap-4">
              <span className="shrink-0 sm:w-72"><Badge tone="blue">{r.when}</Badge></span>
              <span className="text-ink-600 dark:text-ink-400">{r.then}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
