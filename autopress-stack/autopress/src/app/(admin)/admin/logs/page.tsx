import { prisma } from '@/lib/db';
import { formatDate, truncate } from '@/lib/utils';
import { PageHeader, TableWrap, StatCard } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logs' };

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === 'jobs' ? 'jobs' : tab === 'notifications' ? 'notifications' : 'errors';

  const [errors, jobs, notifications, unresolved] = await Promise.all([
    prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.automationJob.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.errorLog.count({ where: { isResolved: false } }),
  ]);

  return (
    <>
      <PageHeader title="Logs" description="Errors, job runs and notifications. A single failed article never stops the rest of the automation." />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Unresolved errors" value={unresolved} tone={unresolved > 0 ? 'danger' : 'success'} />
        <StatCard label="Job runs recorded" value={jobs.length} />
        <StatCard label="Notifications" value={notifications.length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[['errors', 'Errors'], ['jobs', 'Job runs'], ['notifications', 'Notifications']].map(([key, label]) => (
          <a key={key} href={`/admin/logs?tab=${key}`}
            className={`chip border ${active === key ? 'border-accent-600 bg-accent-600 text-white' : 'rule bg-white text-ink-600 dark:bg-ink-900 dark:text-ink-400'}`}>
            {label}
          </a>
        ))}
      </div>

      {active === 'errors' && (errors.length === 0 ? (
        <EmptyState title="No errors logged" hint="Failures from the pipeline, cron endpoint and server actions appear here." />
      ) : (
        <TableWrap>
          <thead><tr><Th>Scope</Th><Th>Message</Th><Th>Entity</Th><Th>When</Th></tr></thead>
          <tbody>
            {errors.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap font-mono text-xs">{e.scope}</Td>
                <Td>
                  <p className="text-red-700 dark:text-red-400">{truncate(e.message, 140)}</p>
                  {e.stack && <details className="mt-1"><summary className="cursor-pointer text-xs text-ink-500">Stack</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-ink-500">{e.stack}</pre></details>}
                </Td>
                <Td className="text-xs text-ink-500">{e.entityType ? `${e.entityType} ${truncate(e.entityId ?? '', 12)}` : '—'}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(e.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ))}

      {active === 'jobs' && (jobs.length === 0 ? (
        <EmptyState title="No job runs yet" hint="Trigger one from the Automation screen." />
      ) : (
        <TableWrap>
          <thead><tr><Th>Type</Th><Th>Status</Th><Th>Attempts</Th><Th>Duration</Th><Th>Result</Th><Th>When</Th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td className="whitespace-nowrap">{j.type.toLowerCase().replace(/_/g, '.')}</Td>
                <Td><StatusBadge status={j.status} /></Td>
                <Td className="text-ink-500">{j.attempts}/{j.maxAttempts}</Td>
                <Td className="text-ink-500">{j.durationMs != null ? `${(j.durationMs / 1000).toFixed(1)}s` : '—'}</Td>
                <Td className="max-w-sm text-xs text-ink-500">
                  {j.lastError
                    ? <span className="text-red-600 dark:text-red-400">{truncate(j.lastError, 110)}</span>
                    : truncate(j.result ? JSON.stringify(j.result) : '—', 110)}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(j.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ))}

      {active === 'notifications' && (notifications.length === 0 ? (
        <EmptyState title="No notifications" hint="Published articles, manual-review escalations and budget warnings land here." />
      ) : (
        <TableWrap>
          <thead><tr><Th>Level</Th><Th>Title</Th><Th>Message</Th><Th>When</Th></tr></thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id}>
                <Td><Badge tone={n.level === 'ERROR' ? 'red' : n.level === 'WARNING' ? 'amber' : n.level === 'SUCCESS' ? 'green' : 'neutral'}>
                  {n.level.toLowerCase()}</Badge></Td>
                <Td className="font-medium">{n.title}</Td>
                <Td className="text-ink-500">{truncate(n.message ?? '', 120)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(n.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ))}
    </>
  );
}
