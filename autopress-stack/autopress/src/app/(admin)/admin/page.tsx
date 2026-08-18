import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings, integrationStatus } from '@/lib/settings';
import { getBudgetState } from '@/lib/ai/budget';
import { formatUsd, formatDate, truncate } from '@/lib/utils';
import { StatCard, PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { StatusBadge, ScoreBadge, Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { discoverTopicsAction } from '@/actions/topics';
import { runJobAction } from '@/actions/automation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function AdminOverview() {
  const settings = await getSettings();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    total, publishedToday, scheduled, drafts, failed, manualReview,
    updatedCount, brokenLinks, avgScore, budget, recent, upcoming, topCategories,
  ] = await Promise.all([
    prisma.article.count({ where: { isSample: false } }),
    prisma.article.count({ where: { status: 'PUBLISHED', publishedAt: { gte: startOfDay } } }),
    prisma.article.count({ where: { status: 'SCHEDULED' } }),
    prisma.article.count({ where: { status: { in: ['RESEARCHING', 'DRAFTING', 'REVIEWING', 'REWRITING', 'READY'] } } }),
    prisma.article.count({ where: { status: 'FAILED' } }),
    prisma.article.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.article.count({ where: { updatedContentAt: { not: null } } }),
    prisma.externalLink.count({ where: { status: 'BROKEN' } }),
    prisma.article.aggregate({ _avg: { qualityScore: true }, where: { qualityScore: { gt: 0 } } }),
    getBudgetState(),
    prisma.article.findMany({
      orderBy: { updatedAt: 'desc' }, take: 8,
      select: { id: true, title: true, status: true, qualityScore: true, updatedAt: true, slug: true },
    }),
    prisma.publishingJob.findMany({
      where: { status: 'PENDING' }, orderBy: { scheduledFor: 'asc' }, take: 5,
      include: { article: { select: { title: true, qualityScore: true } } },
    }),
    prisma.category.findMany({
      take: 6, orderBy: { articles: { _count: 'desc' } },
      select: { id: true, name: true, slug: true, _count: { select: { articles: true } } },
    }),
  ]);

  const status = integrationStatus();
  const unconfigured = Object.entries(status).filter(([, v]) => !v.configured);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${settings.siteName} — ${settings.primaryNiche}. Automation is ${settings.automationEnabled ? 'running' : 'paused'}, auto-publish is ${settings.autoPublish ? 'on' : 'off'}.`}
        actions={
          <>
            <ActionButton action={discoverTopicsAction} label="Discover topics" variant="primary" pendingLabel="Discovering…" />
            <ActionButton action={runJobAction} label="Run publish tick" fields={{ job: 'publish.run' }} />
          </>
        }
      />

      {unconfigured.length > 0 && (
        <div className="card mb-6 border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-300">
            {unconfigured.length} integration{unconfigured.length === 1 ? '' : 's'} running on built-in fallbacks
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-400">
            {unconfigured.map(([k]) => k).join(', ')} — the platform works end to end, but output is generated
            locally rather than from live external data. Add the relevant keys to switch over.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total articles" value={total} href="/admin/articles" />
        <StatCard label="Published today" value={publishedToday} tone="success" />
        <StatCard label="Scheduled" value={scheduled} href="/admin/queue" tone={scheduled > 0 ? 'success' : 'default'} />
        <StatCard label="In pipeline" value={drafts} href="/admin/articles" />
        <StatCard label="Manual review" value={manualReview} href="/admin/articles?status=MANUAL_REVIEW" tone={manualReview > 0 ? 'warning' : 'default'} />
        <StatCard label="Failed" value={failed} href="/admin/logs" tone={failed > 0 ? 'danger' : 'default'} />
        <StatCard label="Avg quality" value={Math.round(avgScore._avg.qualityScore ?? 0)} hint={`min to publish ${settings.minQualityScore}`} />
        <StatCard label="Broken links" value={brokenLinks} tone={brokenLinks > 0 ? 'warning' : 'default'} />
        <StatCard label="Spend this month" value={formatUsd(budget.spentThisMonth)} hint={`budget ${formatUsd(budget.budget)}`} tone={budget.exhausted ? 'danger' : 'default'} href="/admin/ai" />
        <StatCard label="Spend today" value={formatUsd(budget.spentToday)} href="/admin/ai" />
        <StatCard label="Budget remaining" value={formatUsd(budget.remaining)} tone={budget.exhausted ? 'danger' : 'success'} href="/admin/ai" />
        <StatCard label="Articles refreshed" value={updatedCount} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-serif text-lg">Next to publish</h2>
          {upcoming.length === 0 ? (
            <div className="card p-5 text-sm text-ink-500">
              Nothing scheduled. Discover topics, then generate an article to fill the queue.
            </div>
          ) : (
            <TableWrap>
              <thead><tr><Th>Article</Th><Th>Score</Th><Th>Scheduled</Th></tr></thead>
              <tbody>
                {upcoming.map((job) => (
                  <tr key={job.id}>
                    <Td>{truncate(job.article?.title ?? 'Untitled', 60)}</Td>
                    <Td><ScoreBadge score={job.article?.qualityScore ?? 0} min={settings.minQualityScore} /></Td>
                    <Td className="whitespace-nowrap text-ink-500">{formatDate(job.scheduledFor, { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-serif text-lg">Recent activity</h2>
          <TableWrap>
            <thead><tr><Th>Article</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
            <tbody>
              {recent.length === 0 && (
                <tr><Td className="text-ink-500">No articles yet. Run seed data or discover a topic.</Td><Td /><Td /></tr>
              )}
              {recent.map((a) => (
                <tr key={a.id}>
                  <Td><Link className="hover:text-accent-600" href={`/admin/articles/${a.id}`}>{truncate(a.title, 50)}</Link></Td>
                  <Td><StatusBadge status={a.status} /></Td>
                  <Td className="whitespace-nowrap text-ink-500">{formatDate(a.updatedAt, { dateStyle: 'medium' })}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-serif text-lg">Top categories</h2>
      <div className="flex flex-wrap gap-2">
        {topCategories.length === 0 && <p className="text-sm text-ink-500">No categories yet.</p>}
        {topCategories.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`}>
            <Badge tone="blue">{c.name} · {c._count.articles}</Badge>
          </Link>
        ))}
      </div>
    </>
  );
}
