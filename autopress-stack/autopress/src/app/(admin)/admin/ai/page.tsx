import { prisma } from '@/lib/db';
import { getBudgetState } from '@/lib/ai/budget';
import { listProviders, DISCRETIONARY_TASKS } from '@/lib/ai/router';
import { MODEL_RATES } from '@/lib/ai/cost';
import { env } from '@/lib/env';
import { formatUsd, formatDate, truncate } from '@/lib/utils';
import { StatCard, PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td, Section } from '@/components/admin/form-fields';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI & cost' };

export default async function AiPage() {
  const budget = await getBudgetState();
  const providers = listProviders();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byTask, articleCount, recent, failedCalls] = await Promise.all([
    prisma.aIUsage.groupBy({
      by: ['task'],
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.article.count({ where: { aiUsage: { some: {} } } }),
    prisma.aIUsage.findMany({
      orderBy: { createdAt: 'desc' }, take: 20,
      include: { article: { select: { title: true } } },
    }),
    prisma.aIUsage.count({ where: { succeeded: false, createdAt: { gte: monthStart } } }),
  ]);

  const monthTotal = byTask.reduce((sum, t) => sum + Number(t._sum.costUsd ?? 0), 0);
  const avgPerArticle = articleCount > 0 ? monthTotal / articleCount : 0;
  const pct = budget.budget > 0 ? Math.min(100, (budget.spentThisMonth / budget.budget) * 100) : 0;

  return (
    <>
      <PageHeader
        title="AI & cost"
        description="Every model call is recorded with token counts and computed cost. When the monthly budget is exhausted, discretionary tasks stop while in-flight articles are allowed to finish."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Spent this month" value={formatUsd(budget.spentThisMonth)} tone={budget.exhausted ? 'danger' : 'default'} />
        <StatCard label="Spent today" value={formatUsd(budget.spentToday)} />
        <StatCard label="Remaining" value={formatUsd(budget.remaining)} tone={budget.exhausted ? 'danger' : 'success'} />
        <StatCard label="Avg per article" value={formatUsd(avgPerArticle)} hint={`${articleCount} article(s) with usage`} />
      </div>

      <Section title="Monthly budget" description={`Configured at ${formatUsd(budget.budget)} per month in site settings.`} className="mb-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <div className={`h-full rounded-full ${budget.exhausted ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-accent-600'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-ink-500">
          {pct.toFixed(1)}% used.{' '}
          {budget.exhausted
            ? 'Budget exhausted — discretionary generation is paused until next month or until you raise the limit.'
            : `Discretionary tasks (${DISCRETIONARY_TASKS.map((t) => t.toLowerCase().replace(/_/g, ' ')).join(', ')}) pause first.`}
        </p>
        {failedCalls > 0 && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{failedCalls} failed model call(s) this month — see Logs.</p>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Providers" description={`Active provider: ${env.aiProvider}. Change it with the AI_PROVIDER environment variable.`}>
          <ul className="space-y-3">
            {providers.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 border-b rule pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium capitalize">{p.id}{p.id === env.aiProvider && <span className="ml-2 text-xs text-accent-600">active</span>}</p>
                  {p.models && (
                    <p className="mt-0.5 text-xs text-ink-500">
                      cheap {p.models.cheap} · standard {p.models.standard} · premium {p.models.premium}
                    </p>
                  )}
                </div>
                <Badge tone={p.configured ? 'green' : 'neutral'}>{p.configured ? 'configured' : 'no key'}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-500">
            Model routing sends cheap tasks (SEO metadata, linking, discovery) to a small model and reserves the premium
            model for writing and rewriting. Override per tier with AI_MODEL_CHEAP, AI_MODEL_WRITING and AI_MODEL_REVIEW.
          </p>
        </Section>

        <Section title="Cost by task, this month">
          {byTask.length === 0 ? (
            <p className="text-sm text-ink-500">No model calls recorded yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {byTask.sort((a, b) => Number(b._sum.costUsd ?? 0) - Number(a._sum.costUsd ?? 0)).map((t) => (
                <li key={t.task} className="flex items-center justify-between gap-3">
                  <span>{t.task.toLowerCase().replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-3 text-ink-500">
                    <span className="text-xs">
                      {((t._sum.inputTokens ?? 0) + (t._sum.outputTokens ?? 0)).toLocaleString()} tok · {t._count} call(s)
                    </span>
                    <span className="font-medium text-ink-900 dark:text-ink-100">{formatUsd(Number(t._sum.costUsd ?? 0))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <h2 className="mb-3 mt-8 font-serif text-lg">Rate card</h2>
      <TableWrap>
        <thead><tr><Th>Model</Th><Th>Input / 1M tokens</Th><Th>Output / 1M tokens</Th></tr></thead>
        <tbody>
          {Object.entries(MODEL_RATES).map(([model, rate]) => (
            <tr key={model}>
              <Td className="font-mono text-xs">{model}</Td>
              <Td>{formatUsd(rate.input * 1_000_000)}</Td>
              <Td>{formatUsd(rate.output * 1_000_000)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="mt-2 text-xs text-ink-500">
        Rates are configured in <code>src/lib/ai/cost.ts</code>. Update them when provider pricing changes — costs are computed at call time from this table.
      </p>

      <h2 className="mb-3 mt-8 font-serif text-lg">Recent model calls</h2>
      {recent.length === 0 ? (
        <div className="card p-5 text-sm text-ink-500">Nothing recorded yet.</div>
      ) : (
        <TableWrap>
          <thead><tr><Th>Task</Th><Th>Model</Th><Th>Tokens</Th><Th>Cost</Th><Th>Article</Th><Th>When</Th></tr></thead>
          <tbody>
            {recent.map((u) => (
              <tr key={u.id}>
                <Td className="whitespace-nowrap">
                  {u.task.toLowerCase().replace(/_/g, ' ')}
                  {!u.succeeded && <Badge tone="red" className="ml-2">failed</Badge>}
                </Td>
                <Td className="font-mono text-xs">{u.model}</Td>
                <Td className="whitespace-nowrap text-ink-500">{u.inputTokens.toLocaleString()} in / {u.outputTokens.toLocaleString()} out</Td>
                <Td>{formatUsd(Number(u.costUsd))}</Td>
                <Td className="text-ink-500">{u.article ? truncate(u.article.title, 36) : '—'}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(u.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
