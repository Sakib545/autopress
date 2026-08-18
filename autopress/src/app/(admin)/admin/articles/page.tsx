import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDate, truncate } from '@/lib/utils';
import { PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td } from '@/components/admin/form-fields';
import { StatusBadge, ScoreBadge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { EmptyState } from '@/components/ui/empty-state';
import { publishNowAction, unpublishAction, rerunReviewAction, refreshArticleAction } from '@/actions/articles';
import { articleHref } from '@/components/site/article-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Articles' };

const TABS = ['ALL', 'PUBLISHED', 'SCHEDULED', 'READY', 'MANUAL_REVIEW', 'DRAFTING', 'FAILED', 'ARCHIVED'] as const;
const PAGE_SIZE = 25;

export default async function ArticlesPage({ searchParams }: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { status, q, page } = await searchParams;
  const active = (TABS as readonly string[]).includes(status ?? '') ? (status as string) : 'ALL';
  const pageNum = Math.max(1, Number(page) || 1);
  const settings = await getSettings();

  const where = {
    ...(active === 'ALL' ? {} : { status: active as never }),
    ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [articles, total, counts] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: { select: { slug: true, name: true } }, author: { select: { name: true } } },
    }),
    prisma.article.count({ where }),
    prisma.article.groupBy({ by: ['status'], _count: true }),
  ]);

  const countFor = (s: string) =>
    s === 'ALL' ? counts.reduce((n, c) => n + c._count, 0) : counts.find((c) => c.status === s)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Articles"
        description={`${total} matching article${total === 1 ? '' : 's'}. Minimum publish score is ${settings.minQualityScore}.`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/articles?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`chip border ${active === t ? 'border-accent-600 bg-accent-600 text-white' : 'rule bg-white text-ink-600 dark:bg-ink-900 dark:text-ink-400'}`}>
            {t.toLowerCase().replace('_', ' ')} · {countFor(t)}
          </Link>
        ))}
      </div>

      <form className="mb-4 flex gap-2" action="/admin/articles">
        <input type="hidden" name="status" value={active} />
        <input className="input max-w-sm" name="q" defaultValue={q ?? ''} placeholder="Search titles…" />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      {articles.length === 0 ? (
        <EmptyState title="No articles here" hint="Generate one from an approved topic, or seed demo content with npm run db:seed." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr><Th>Title</Th><Th>Score</Th><Th>Status</Th><Th>Date</Th><Th className="text-right">Actions</Th></tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link href={`/admin/articles/${a.id}`} className="font-medium hover:text-accent-600">
                      {truncate(a.title, 62)}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {a.category?.name ?? 'uncategorised'} · {a.wordCount} words · {a.author?.name ?? 'no author'}
                      {a.isSample ? ' · sample' : ''}
                    </p>
                  </Td>
                  <Td><ScoreBadge score={a.qualityScore} min={settings.minQualityScore} /></Td>
                  <Td><StatusBadge status={a.status} /></Td>
                  <Td className="whitespace-nowrap text-xs text-ink-500">
                    {a.publishedAt ? formatDate(a.publishedAt, { dateStyle: 'medium' }) : formatDate(a.updatedAt, { dateStyle: 'medium' })}
                    {a.updatedContentAt && <p>upd {formatDate(a.updatedContentAt, { dateStyle: 'medium' })}</p>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {a.status === 'PUBLISHED' ? (
                        <>
                          <Link className="btn-secondary px-2.5 py-1 text-xs" href={articleHref({ slug: a.slug, category: a.category })}>View</Link>
                          <ActionButton action={refreshArticleAction} label="Refresh" fields={{ id: a.id }} pendingLabel="Checking…" />
                          <ActionButton action={unpublishAction} label="Unpublish" variant="danger" fields={{ id: a.id }}
                            confirmText="Unpublish this article?" />
                        </>
                      ) : (
                        <>
                          <ActionButton action={rerunReviewAction} label="Re-review" fields={{ id: a.id }} pendingLabel="Scoring…" />
                          <ActionButton action={publishNowAction} label="Publish" variant="primary" fields={{ id: a.id }} />
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-500">Page {pageNum} of {pages}</span>
              <div className="flex gap-2">
                {pageNum > 1 && <Link className="btn-secondary" href={`/admin/articles?status=${active}&page=${pageNum - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>Previous</Link>}
                {pageNum < pages && <Link className="btn-secondary" href={`/admin/articles?status=${active}&page=${pageNum + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>Next</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
