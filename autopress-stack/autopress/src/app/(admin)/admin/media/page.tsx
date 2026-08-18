import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { formatUsd, formatDate, truncate } from '@/lib/utils';
import { PageHeader, StatCard } from '@/components/admin/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const [media, counts, cost] = await Promise.all([
    prisma.media.findMany({
      orderBy: { createdAt: 'desc' }, take: 60,
      include: { article: { select: { id: true, title: true } } },
    }),
    prisma.media.groupBy({ by: ['source'], _count: true }),
    prisma.media.aggregate({ _sum: { generationCost: true } }),
  ]);

  const missingAlt = media.filter((m) => !m.altText.trim()).length;

  return (
    <>
      <PageHeader
        title="Media"
        description={`Image provider: ${env.imageProvider}. Every article gets a featured image — when no image API is configured, a deterministic SVG cover is generated per slug so nothing ships without artwork.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total images" value={media.length} />
        {counts.map((c) => (
          <StatCard key={c.source} label={c.source.toLowerCase().replace(/_/g, ' ')} value={c._count} />
        ))}
        <StatCard label="Generation cost" value={formatUsd(Number(cost._sum.generationCost ?? 0))} />
      </div>

      {missingAlt > 0 && (
        <div className="card mb-6 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {missingAlt} image(s) missing ALT text. Rebuild the affected article to regenerate it.
        </div>
      )}

      {media.length === 0 ? (
        <EmptyState title="No media yet" hint="Featured images are created automatically as part of the publishing pipeline." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((m) => (
            <div key={m.id} className="card overflow-hidden">
              <div className="relative aspect-[16/9] bg-ink-100 dark:bg-ink-800">
                <Image src={m.url} alt={m.altText || 'Featured image'} fill sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover" unoptimized={m.url.startsWith('/api/')} />
              </div>
              <div className="p-3">
                <Badge tone={m.source === 'FALLBACK' ? 'neutral' : m.source === 'AI_GENERATED' ? 'purple' : 'blue'}>
                  {m.source.toLowerCase().replace(/_/g, ' ')}
                </Badge>
                <p className="mt-2 text-xs text-ink-500">{truncate(m.altText || 'No ALT text', 70)}</p>
                {m.article && (
                  <Link href={`/admin/articles/${m.article.id}`} className="mt-1 block text-xs text-accent-600 hover:underline">
                    {truncate(m.article.title, 38)}
                  </Link>
                )}
                <p className="mt-1 text-[11px] text-ink-400">
                  {m.width && m.height ? `${m.width}×${m.height} · ` : ''}{formatDate(m.createdAt, { dateStyle: 'short' })}
                </p>
                {m.attribution && <p className="mt-1 text-[11px] text-ink-400">{truncate(m.attribution, 40)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
