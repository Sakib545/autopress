import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDate, formatUsd, truncate } from '@/lib/utils';
import { PageHeader } from '@/components/admin/stat-card';
import { Field, Text, Area, Select, Check, Section } from '@/components/admin/form-fields';
import { StatusBadge, ScoreBadge, Badge } from '@/components/ui/badge';
import { ActionForm, ActionButton } from '@/components/admin/action-form';
import { articleHref } from '@/components/site/article-card';
import {
  updateArticleAction, publishNowAction, unpublishAction, scheduleAction,
  rerunReviewAction, rebuildOutputAction, refreshArticleAction, archiveArticleAction,
} from '@/actions/articles';
import { ArticleVideoPanel } from '@/components/admin/video-panel';
import { articleVideoFor } from '@/lib/pipeline/article-video';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const SCORE_FIELDS = [
  ['accuracy', 'Accuracy'], ['usefulness', 'Usefulness'], ['originality', 'Originality'],
  ['readability', 'Readability'], ['intentMatch', 'Intent match'], ['structure', 'Structure'],
  ['seo', 'SEO'], ['factReliability', 'Fact reliability'], ['internalLinking', 'Internal linking'],
  ['spamRisk', 'Spam risk'],
] as const;

export default async function ArticleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settings = await getSettings();

  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      category: true,
      author: true,
      featuredMedia: true,
      tags: { include: { tag: true } },
      keywords: { include: { keyword: true } },
      sources: { include: { source: true } },
      reviews: { orderBy: { attempt: 'desc' } },
      revisions: { orderBy: { version: 'desc' }, take: 10, include: { editor: { select: { email: true } } } },
      outboundLinks: { include: { toArticle: { select: { title: true, slug: true } } } },
      externalLinks: true,
      aiUsage: true,
      topic: { include: { research: { include: { facts: true, sources: true } } } },
    },
  });

  if (!article) notFound();

  // Loaded separately so a video lookup can never break the article screen.
  const video = await articleVideoFor(article.id).catch(() => null);

  const latestReview = article.reviews[0];
  const totalCost = article.aiUsage.reduce((sum, u) => sum + Number(u.costUsd), 0);
  const unverified = article.topic?.research?.facts.filter((f) => f.verdict !== 'VERIFIED') ?? [];

  return (
    <>
      <PageHeader
        title={truncate(article.title, 70)}
        description={`${article.status.toLowerCase().replace('_', ' ')} · ${article.wordCount} words · ${article.readingTime} min read · ${article.contentType.toLowerCase().replace('_', ' ')}`}
        actions={
          <>
            <Link className="btn-secondary" href="/admin/articles">Back</Link>
            {article.status === 'PUBLISHED' && (
              <Link className="btn-secondary" href={articleHref({ slug: article.slug, category: article.category })}>View live</Link>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={article.status} />
        <ScoreBadge score={article.qualityScore} min={settings.minQualityScore} />
        {article.factCheckPass ? <Badge tone="green">fact check passed</Badge> : <Badge tone="amber">fact check incomplete</Badge>}
        {article.hasAffiliateLinks && <Badge tone="purple">affiliate</Badge>}
        {article.sponsorship !== 'NONE' && <Badge tone="amber">{article.sponsorship.toLowerCase().replace('_', ' ')}</Badge>}
        {!article.isIndexable && <Badge tone="red">noindex</Badge>}
        {article.isSample && <Badge tone="neutral">sample data</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Edit" description="Manual edits are recorded as a revision with your account as editor.">
            <ActionForm action={updateArticleAction} submitLabel="Save changes" className="space-y-4">
              <input type="hidden" name="id" value={article.id} />
              <Field label="Title"><Text name="title" defaultValue={article.title} required /></Field>
              <Field label="Subtitle"><Text name="subtitle" defaultValue={article.subtitle} /></Field>
              <Field label="Excerpt"><Area name="excerpt" defaultValue={article.excerpt} rows={2} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SEO title" hint={`${(article.seoTitle ?? '').length}/60 characters`}>
                  <Text name="seoTitle" defaultValue={article.seoTitle} />
                </Field>
                <Field label="Meta description" hint={`${(article.metaDesc ?? '').length}/160 characters`}>
                  <Text name="metaDesc" defaultValue={article.metaDesc} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sponsorship">
                  <Select name="sponsorship" defaultValue={article.sponsorship}
                    options={[
                      { value: 'NONE', label: 'None — independent editorial' },
                      { value: 'SPONSORED', label: 'Sponsored' },
                      { value: 'PAID_PARTNERSHIP', label: 'Paid partnership' },
                      { value: 'ADVERTISEMENT', label: 'Advertisement' },
                    ]} />
                </Field>
                <Field label="Sponsor name"><Text name="sponsorName" defaultValue={article.sponsorName} /></Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <Check name="isPinned" label="Pin to editor's picks" defaultChecked={article.isPinned} />
                <Check name="isIndexable" label="Allow search engines to index" defaultChecked={article.isIndexable} />
              </div>
            </ActionForm>
          </Section>

          <Section title="Content preview" description="Rendered exactly as readers see it.">
            {article.contentHtml ? (
              <div className="article-body max-h-[420px] overflow-y-auto rounded-lg border rule p-4 text-sm"
                dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
            ) : (
              <p className="text-sm text-ink-500">No body generated yet. Run the pipeline from the topic screen.</p>
            )}
          </Section>

          {latestReview && (
            <Section title={`Quality review — attempt ${latestReview.attempt}`}
              description={latestReview.passed ? 'Passed the publish threshold.' : 'Below threshold; weak sections were rewritten.'}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {SCORE_FIELDS.map(([key, label]) => (
                  <div key={key} className="rounded-lg border rule p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
                    <p className="font-serif text-lg">{latestReview[key]}</p>
                  </div>
                ))}
              </div>
              {latestReview.weakSections.length > 0 && (
                <p className="mt-3 text-sm text-ink-600 dark:text-ink-400">
                  <span className="font-medium">Weak sections:</span> {latestReview.weakSections.join(', ')}
                </p>
              )}
              {latestReview.feedback && <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">{latestReview.feedback}</p>}
            </Section>
          )}

          <Section title="Research & sources" description="Every factual claim in the article must trace back to one of these.">
            {article.sources.length === 0 && <p className="text-sm text-ink-500">No sources recorded.</p>}
            <ul className="space-y-2 text-sm">
              {article.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-2">
                  <a href={s.source.url} target="_blank" rel="noopener noreferrer nofollow"
                    className="text-accent-700 hover:underline dark:text-accent-400">{truncate(s.source.title ?? s.source.domain, 70)}</a>
                  <span className="text-xs text-ink-500">{s.source.domain} · credibility {s.source.credibility}</span>
                </li>
              ))}
            </ul>
            {unverified.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <p className="font-medium text-amber-900 dark:text-amber-300">{unverified.length} claim(s) not fully verified</p>
                <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-400">
                  {unverified.slice(0, 5).map((f) => <li key={f.id}>{truncate(f.claim, 110)} — {f.verdict.toLowerCase()}</li>)}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Revision history">
            {article.revisions.length === 0 && <p className="text-sm text-ink-500">No revisions yet.</p>}
            <ul className="space-y-3 text-sm">
              {article.revisions.map((r) => (
                <li key={r.id} className="border-l-2 border-accent-300 pl-3">
                  <p className="font-medium">v{r.version} · {r.reason.toLowerCase().replace(/_/g, ' ')}</p>
                  <p className="text-xs text-ink-500">
                    {formatDate(r.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.editor ? ` · ${r.editor.email}` : r.aiModel ? ` · ${r.aiModel}` : ''}
                    {r.qualityBefore != null && r.qualityAfter != null ? ` · score ${r.qualityBefore} → ${r.qualityAfter}` : ''}
                  </p>
                  {r.summary && <p className="mt-0.5 text-ink-600 dark:text-ink-400">{r.summary}</p>}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              <ActionButton action={rerunReviewAction} label="Re-run quality review" fields={{ id: article.id }} pendingLabel="Scoring…" />
              <ActionButton action={rebuildOutputAction} label="Rebuild SEO, links & image" fields={{ id: article.id }} pendingLabel="Rebuilding…" />
              <ActionButton action={refreshArticleAction} label="Check freshness" fields={{ id: article.id }} pendingLabel="Checking…" />
              {article.status !== 'PUBLISHED' && (
                <>
                  <ActionButton action={publishNowAction} label="Publish now" variant="primary" fields={{ id: article.id }} />
                  <ActionButton action={publishNowAction} label="Force publish (ignore score)" variant="danger"
                    fields={{ id: article.id, force: 'true' }}
                    confirmText="Publish below the minimum quality score?" />
                </>
              )}
              {article.status === 'PUBLISHED' && (
                <ActionButton action={unpublishAction} label="Unpublish" variant="danger" fields={{ id: article.id }}
                  confirmText="Unpublish this article?" />
              )}
              <ActionButton action={archiveArticleAction} label="Archive" variant="danger" fields={{ id: article.id }}
                confirmText="Archive this article? It will be removed from the public site." />
            </div>
          </Section>

          <ArticleVideoPanel
            articleId={article.id}
            articleStatus={article.status}
            video={video}
            enabled={env.mptEnabled}
          />

          <Section title="Schedule">
            <ActionForm action={scheduleAction} submitLabel="Schedule" variant="secondary" className="space-y-3">
              <input type="hidden" name="id" value={article.id} />
              <Field label="Publish at" hint="Leave empty to use the next configured publishing slot.">
                <Text name="scheduledFor" type="datetime-local"
                  defaultValue={article.scheduledFor ? new Date(article.scheduledFor).toISOString().slice(0, 16) : undefined} />
              </Field>
            </ActionForm>
          </Section>

          <Section title="Metadata">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs uppercase text-ink-500">Slug</dt><dd className="break-all">{article.slug}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Intent</dt><dd>{article.intent.toLowerCase()}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Freshness tier</dt><dd>{article.freshnessTier.toLowerCase()}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Next check</dt><dd>{formatDate(article.nextCheckAt, { dateStyle: 'medium' }) || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Published</dt><dd>{formatDate(article.publishedAt, { dateStyle: 'medium' }) || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Content updated</dt><dd>{formatDate(article.updatedContentAt, { dateStyle: 'medium' }) || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">Views</dt><dd>{article.viewCount}</dd></div>
              <div><dt className="text-xs uppercase text-ink-500">AI cost</dt><dd>{formatUsd(totalCost)}</dd></div>
            </dl>
          </Section>

          <Section title="Keywords">
            <div className="flex flex-wrap gap-1.5">
              {article.keywords.length === 0 && <p className="text-sm text-ink-500">None assigned.</p>}
              {article.keywords.map((k) => (
                <Badge key={k.keywordId} tone={k.role === 'PRIMARY' ? 'blue' : 'neutral'}>{k.keyword.term}</Badge>
              ))}
            </div>
          </Section>

          <Section title="Internal links">
            {article.outboundLinks.length === 0 && <p className="text-sm text-ink-500">No outbound internal links.</p>}
            <ul className="space-y-1.5 text-sm">
              {article.outboundLinks.map((l) => (
                <li key={l.id}>
                  <span className="text-ink-500">“{truncate(l.anchorText, 34)}” → </span>
                  {truncate(l.toArticle.title, 40)}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="External links">
            {article.externalLinks.length === 0 && <p className="text-sm text-ink-500">None.</p>}
            <ul className="space-y-1.5 text-sm">
              {article.externalLinks.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <StatusBadge status={l.status} />
                  <span className="truncate text-ink-600 dark:text-ink-400">{l.domain}</span>
                  {l.isAffiliate && <Badge tone="purple">aff</Badge>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
