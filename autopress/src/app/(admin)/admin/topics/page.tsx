import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDate, truncate } from '@/lib/utils';
import { PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { EmptyState } from '@/components/ui/empty-state';
import { discoverTopicsAction, setTopicStatusAction, generateArticleAction, deleteTopicAction } from '@/actions/topics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Topics' };

const TABS = ['NEW', 'APPROVED', 'QUEUED', 'WRITING', 'PUBLISHED', 'DUPLICATE', 'REJECTED'] as const;

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (TABS as readonly string[]).includes(status ?? '') ? (status as string) : 'NEW';
  const settings = await getSettings();

  const [topics, counts] = await Promise.all([
    prisma.topic.findMany({
      where: { status: active as never },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
      take: 80,
      include: {
        category: { select: { name: true } },
        keywords: { include: { keyword: { select: { term: true } } }, where: { role: 'PRIMARY' }, take: 1 },
        duplicateOf: { select: { title: true } },
      },
    }),
    prisma.topic.groupBy({ by: ['status'], _count: true }),
  ]);

  const countFor = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Topics"
        description={`Discovery proposes ideas from your niche, filters duplicates, then scores them. Only approved topics enter the writing pipeline. Intent mix target: ${Object.entries(settings.intentRatios).map(([k, v]) => `${v}% ${k.toLowerCase()}`).join(', ')}.`}
        actions={<ActionButton action={discoverTopicsAction} label="Discover topics" variant="primary" pendingLabel="Discovering…" />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a key={t} href={`/admin/topics?status=${t}`}
            className={`chip border ${active === t ? 'border-accent-600 bg-accent-600 text-white' : 'rule bg-white text-ink-600 dark:bg-ink-900 dark:text-ink-400'}`}>
            {t.toLowerCase().replace('_', ' ')} · {countFor(t)}
          </a>
        ))}
      </div>

      {topics.length === 0 ? (
        <EmptyState
          title={`No ${active.toLowerCase()} topics`}
          hint="Run discovery to generate ideas from your configured niche, categories and previously successful content."
          action={<ActionButton action={discoverTopicsAction} label="Discover topics" variant="primary" />}
        />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Topic</Th><Th>Intent</Th><Th>Priority</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id}>
                <Td>
                  <p className="font-medium">{truncate(t.title, 70)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {t.keywords[0]?.keyword.term ?? 'no keyword'}
                    {t.category ? ` · ${t.category.name}` : ''}
                    {' · '}{formatDate(t.createdAt, { dateStyle: 'medium' })}
                  </p>
                  {t.duplicateOf && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Duplicate of “{truncate(t.duplicateOf.title, 45)}” ({Math.round((t.similarityScore ?? 0) * 100)}% similar)
                    </p>
                  )}
                  {t.rejectionReason && <p className="mt-1 text-xs text-ink-500">{t.rejectionReason}</p>}
                </Td>
                <Td><Badge tone="blue">{t.intent.toLowerCase()}</Badge></Td>
                <Td>
                  <span className="font-medium">{t.priorityScore}</span>
                  <p className="text-xs text-ink-500">comm {t.commercialScore} · diff {t.difficulty}</p>
                </Td>
                <Td><StatusBadge status={t.status} /></Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {t.status === 'NEW' && (
                      <>
                        <ActionButton action={setTopicStatusAction} label="Approve" variant="primary" fields={{ id: t.id, status: 'APPROVED' }} />
                        <ActionButton action={setTopicStatusAction} label="Reject" fields={{ id: t.id, status: 'REJECTED' }} />
                      </>
                    )}
                    {(t.status === 'APPROVED' || t.status === 'QUEUED') && (
                      <ActionButton action={generateArticleAction} label="Generate article" variant="primary"
                        fields={{ id: t.id }} pendingLabel="Running pipeline…" />
                    )}
                    {t.status === 'REJECTED' && (
                      <ActionButton action={setTopicStatusAction} label="Restore" fields={{ id: t.id, status: 'NEW' }} />
                    )}
                    <ActionButton action={deleteTopicAction} label="Delete" variant="danger" fields={{ id: t.id }}
                      confirmText="Delete this topic permanently?" />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
