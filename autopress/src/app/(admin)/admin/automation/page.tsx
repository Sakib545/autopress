import { getSettings, integrationStatus } from '@/lib/settings';
import { automationSnapshot, TRIGGERABLE_JOBS, JOB_TYPE_BY_ID, JOB_ID_BY_TYPE, type TriggerableJob } from '@/lib/jobs';
import { hasRedis } from '@/lib/env';
import { formatDate } from '@/lib/utils';
import { StatCard, PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td, Section } from '@/components/admin/form-fields';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { runJobAction } from '@/actions/automation';
import { toggleAutomationAction } from '@/actions/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automation' };

type JobInfo = { label: string; detail: string; cadence: string; group: 'Content' | 'Video' };

/**
 * Copy for every job the admin can trigger. Typed against TriggerableJob so a new
 * entry in TRIGGERABLE_JOBS fails the build here instead of rendering `undefined`.
 * Cadences mirror worker/schedulers.ts.
 */
const JOB_INFO: Record<TriggerableJob, JobInfo> = {
  'topic.discover': {
    label: 'Topic discovery',
    detail: 'Proposes new ideas, removes duplicates, scores and auto-approves the daily quota.',
    cadence: 'Daily · 06:00',
    group: 'Content',
  },
  'publish.run': {
    label: 'Publish tick',
    detail: 'Publishes any scheduled article whose time has arrived. Safe to run repeatedly.',
    cadence: 'Every 5 min',
    group: 'Content',
  },
  'refresh.scan': {
    label: 'Freshness scan',
    detail: 'Finds articles past their check date and queues updates for the stale ones.',
    cadence: 'Daily · 03:30',
    group: 'Content',
  },
  'links.check': {
    label: 'Link checker',
    detail: 'Verifies external and affiliate links, marking redirects and breakages.',
    cadence: 'Weekly · Mon',
    group: 'Content',
  },
  'video.generate': {
    label: 'Video dispatch',
    detail: 'Sweeps up queued video rows and sends them to the render provider.',
    cadence: 'Every 10 min',
    group: 'Video',
  },
  'video.poll': {
    label: 'Video poll',
    detail: 'Polls in-flight render tasks and attaches finished videos to their articles.',
    cadence: 'Every 2 min',
    group: 'Video',
  },
};

const FALLBACK_INFO: JobInfo = {
  label: 'Unknown job',
  detail: 'No description is registered for this job id yet.',
  cadence: 'on demand',
  group: 'Content',
};

const GROUPS = ['Content', 'Video'] as const;

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 mt-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-serif text-lg">{title}</h2>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export default async function AutomationPage() {
  const [settings, snapshot] = await Promise.all([getSettings(), automationSnapshot()]);
  const status = integrationStatus();
  const redis = hasRedis();

  const jobsByGroup = GROUPS.map((group) => ({
    group,
    jobs: TRIGGERABLE_JOBS.filter((job) => (JOB_INFO[job] ?? FALLBACK_INFO).group === group),
  })).filter((g) => g.jobs.length > 0);

  return (
    <>
      <PageHeader
        title="Automation"
        description="Every scheduled job can also be run on demand here. Jobs are idempotent — running one twice will not duplicate content."
        actions={
          <Badge tone={settings.automationEnabled ? 'green' : 'amber'}>
            {settings.automationEnabled ? 'Automation running' : 'Automation paused'}
          </Badge>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Topics waiting" value={snapshot.pendingTopics} href="/admin/topics" />
        <StatCard label="Ready to schedule" value={snapshot.readyArticles} href="/admin/articles?status=READY" />
        <StatCard label="Scheduled jobs" value={snapshot.scheduled} href="/admin/queue" />
        <StatCard label="Failed jobs" value={snapshot.failedJobs} tone={snapshot.failedJobs > 0 ? 'danger' : 'default'} href="/admin/logs" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Master switches" description="Automation off means no scheduled job does any work, even if cron fires.">
          <div className="divide-y divide-ink-200 dark:divide-ink-800">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Automation</p>
                <p className="mt-1 text-sm text-ink-500">Discovery, writing, refresh and link checks.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={settings.automationEnabled ? 'green' : 'neutral'}>{settings.automationEnabled ? 'running' : 'paused'}</Badge>
                <ActionButton action={toggleAutomationAction}
                  label={settings.automationEnabled ? 'Pause' : 'Enable'}
                  variant={settings.automationEnabled ? 'danger' : 'primary'}
                  fields={{ field: 'automationEnabled', value: String(!settings.automationEnabled) }} />
              </div>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 pt-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Auto publish</p>
                <p className="mt-1 text-sm text-ink-500">
                  When off, articles that pass review wait in <em>Ready</em> for a human to release them.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={settings.autoPublish ? 'green' : 'neutral'}>{settings.autoPublish ? 'on' : 'off'}</Badge>
                <ActionButton action={toggleAutomationAction}
                  label={settings.autoPublish ? 'Turn off' : 'Turn on'}
                  variant={settings.autoPublish ? 'danger' : 'primary'}
                  fields={{ field: 'autoPublish', value: String(!settings.autoPublish) }} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Execution mode" description="Where jobs actually run right now.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-500">Queue backend</span>
              <Badge tone={redis ? 'green' : 'amber'}>{redis ? 'Redis + BullMQ worker' : 'inline (no Redis)'}</Badge>
            </div>
            {!redis && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                Without <code>REDIS_URL</code> the platform runs each job inline in the web process. That is fine for local
                development, but on Railway you should run the separate worker service so long article generations do not
                block requests.
              </p>
            )}
            <div className="divide-y divide-ink-200 dark:divide-ink-800">
              {Object.entries(status).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="capitalize text-ink-500">{key}</span>
                  <span className="flex items-center gap-2">
                    <code className="text-xs text-ink-400">{value.provider}</code>
                    <Badge tone={value.configured ? 'green' : 'amber'}>{value.configured ? 'configured' : 'fallback'}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionHeading
        title="Scheduled jobs"
        hint={redis ? 'Run now queues the job on the worker.' : 'Run now executes inline in this process.'}
      />

      <div className="space-y-6">
        {jobsByGroup.map(({ group, jobs }) => (
          <div key={group}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">{group}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job) => {
                const info = JOB_INFO[job] ?? FALLBACK_INFO;
                const last = snapshot.lastByType[JOB_TYPE_BY_ID[job]];
                return (
                  <div key={job} className="card-interactive flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium leading-tight">{info.label}</p>
                      <Badge tone="blue" className="shrink-0 whitespace-nowrap">{info.cadence}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{info.detail}</p>
                    <code className="mt-2 block truncate text-xs text-ink-400">{job}</code>

                    <div className="mt-4 flex items-end justify-between gap-3 border-t rule pt-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-ink-400">Last run</p>
                        {last ? (
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={last.status} />
                            <span className="text-xs text-ink-500">
                              {formatDate(last.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </span>
                        ) : (
                          <p className="mt-1 text-xs text-ink-500">Not recorded yet</p>
                        )}
                      </div>
                      <ActionButton action={runJobAction} label="Run now" variant="primary" fields={{ job }} pendingLabel="Running…" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <SectionHeading title="Recent job runs" hint="Last 10 recorded runs across all queues." />
      {snapshot.lastRuns.length === 0 ? (
        <div className="card p-5 text-sm text-ink-500">No jobs have run yet.</div>
      ) : (
        <TableWrap>
          <thead><tr><Th>Job</Th><Th>Status</Th><Th>Duration</Th><Th>When</Th><Th>Result</Th></tr></thead>
          <tbody>
            {snapshot.lastRuns.map((j) => (
              <tr key={j.id} className="transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                <Td className="whitespace-nowrap">
                  <code className="text-xs">{JOB_ID_BY_TYPE[j.type] ?? j.type.toLowerCase().replace(/_/g, '.')}</code>
                </Td>
                <Td><StatusBadge status={j.status} /></Td>
                <Td className="whitespace-nowrap tabular-nums text-ink-500">{j.durationMs != null ? `${(j.durationMs / 1000).toFixed(1)}s` : '—'}</Td>
                <Td className="whitespace-nowrap text-ink-500">{formatDate(j.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</Td>
                <Td className={j.lastError ? 'max-w-xs truncate text-xs text-red-600 dark:text-red-400' : 'max-w-xs truncate text-xs text-ink-500'}>
                  {j.lastError ?? (j.result ? JSON.stringify(j.result) : '—')}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
