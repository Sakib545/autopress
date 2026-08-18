import { prisma } from '@/lib/db';
import { PageHeader, TableWrap, StatCard } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keywords' };

export default async function KeywordsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  const [keywords, total, byIntent] = await Promise.all([
    prisma.keyword.findMany({
      where: q ? { term: { contains: q, mode: 'insensitive' } } : {},
      orderBy: [{ commercialScore: 'desc' }, { term: 'asc' }],
      take: 100,
      include: {
        _count: { select: { articles: true, topics: true } },
        articles: { where: { role: 'PRIMARY' }, take: 1, include: { article: { select: { title: true, status: true } } } },
      },
    }),
    prisma.keyword.count(),
    prisma.keyword.groupBy({ by: ['intent'], _count: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Keywords"
        description="Extracted during discovery and attached to topics and articles. Commercial score drives prioritisation; difficulty is an estimate, not a live SERP metric."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total keywords" value={total} />
        {byIntent.slice(0, 3).map((i) => (
          <StatCard key={i.intent ?? 'none'} label={(i.intent ?? 'unclassified').toLowerCase()} value={i._count} />
        ))}
      </div>

      <form className="mb-4 flex gap-2" action="/admin/keywords">
        <input className="input max-w-sm" name="q" defaultValue={q ?? ''} placeholder="Search keywords…" />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      {keywords.length === 0 ? (
        <EmptyState title="No keywords yet" hint="Keywords are created automatically when topic discovery runs." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Term</Th><Th>Intent</Th><Th>Commercial</Th><Th>Difficulty</Th><Th>Used by</Th><Th>Primary for</Th></tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.term}</Td>
                <Td>{k.intent ? <Badge tone="blue">{k.intent.toLowerCase()}</Badge> : <span className="text-ink-500">—</span>}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full bg-accent-600" style={{ width: `${k.commercialScore}%` }} />
                    </div>
                    <span className="text-xs text-ink-500">{k.commercialScore}</span>
                  </div>
                </Td>
                <Td className="text-ink-500">{k.difficulty}</Td>
                <Td className="text-ink-500">{k._count.articles} article(s) · {k._count.topics} topic(s)</Td>
                <Td className="text-ink-500">
                  {k.articles[0] ? truncate(k.articles[0].article.title, 42) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
