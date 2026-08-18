import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDate, truncate } from '@/lib/utils';
import { PageHeader, TableWrap, StatCard } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { StatusBadge, ScoreBadge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { EmptyState } from '@/components/ui/empty-state';
import { runJobAction } from '@/actions/automation';
import { publishNowAction } from '@/actions/articles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Publishing queue' };

export default async function QueuePage() {
  const settings = await getSettings();

  const [jobs, pending, failed, published] = await Promise.all([
    prisma.publishingJob.findMany({
      orderBy: [{ status: 'asc' }, { scheduledFor: 'asc' }],
      take: 60,
      include: {
        article: {
          select: { id: true, title: true, qualityScore: true, status: true, wordCount: true, category: { select: { name: true } } },
        },
        topic: { select: { title: true } },
      },
    }),
    prisma.publishingJob.count({ where: { status: 'PENDING' } }),
    prisma.publishingJob.count({ where: { status: 'FAILED' } }),
    prisma.publishingJob.count({ where: { status: 'COMPLETED' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Publishing queue"
        description={`Slots are ${settings.publishTimes.join(', ')} at ${settings.articlesPerDay} article(s) per day. Auto publish is ${settings.autoPublish ? 'on' : 'off'}.`}
        actions={<ActionButton action={runJobAction} label="Run publish tick" variant="primary" fields={{ job: 'publish.run' }} pendingLabel="Publishing…" />}
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={pending} />
        <StatCard label="Completed" value={published} tone="success" />
        <StatCard label="Failed" value={failed} tone={failed > 0 ? 'danger' : 'default'} />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          hint="Articles land here automatically once they pass quality review. Generate one from an approved topic to fill the queue."
          action={<Link className="btn-primary" href="/admin/topics">Go to topics</Link>}
        />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Article</Th><Th>Score</Th><Th>Scheduled</Th><Th>Status</Th><Th>Retries</Th><Th className="text-right">Action</Th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td>
                  {j.article ? (
                    <Link href={`/admin/articles/${j.article.id}`} className="font-medium hover:text-accent-600">
                      {truncate(j.article.title, 58)}
                    </Link>
                  ) : (
                    <span className="text-ink-500">{truncate(j.topic?.title ?? 'Unlinked job', 58)}</span>
                  )}
                  <p className="mt-0.5 text-xs text-ink-500">
                    {j.article?.category?.name ?? '—'} · {j.article?.wordCount ?? 0} words · priority {j.priority}
                  </p>
                  {j.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{truncate(j.lastError, 110)}</p>}
                </Td>
                <Td><ScoreBadge score={j.article?.qualityScore ?? 0} min={settings.minQualityScore} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">
                  {formatDate(j.scheduledFor, { dateStyle: 'medium', timeStyle: 'short' })}
                </Td>
                <Td><StatusBadge status={j.status} /></Td>
                <Td className="text-ink-500">{j.retryCount}/{j.maxRetries}</Td>
                <Td className="text-right">
                  {j.article && j.status !== 'COMPLETED' && (
                    <ActionButton action={publishNowAction} label="Publish now" variant="primary" fields={{ id: j.article.id }} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
