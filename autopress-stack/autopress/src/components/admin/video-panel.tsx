import Link from 'next/link';
import type { ArticleVideo } from '@prisma/client';
import { formatDate, truncate } from '@/lib/utils';
import { Badge, type Tone } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-form';
import { Section } from '@/components/admin/form-fields';
import { CopyButton } from '@/components/admin/copy-button';
import {
  generateVideoAction, regenerateVideoAction, retryVideoAction, refreshVideoStatusAction,
} from '@/actions/videos';

export const VIDEO_TONES: Record<string, Tone> = {
  QUEUED: 'neutral',
  SCRIPTING: 'blue',
  GENERATING: 'amber',
  COMPLETED: 'green',
  FAILED: 'red',
  PUBLISHED: 'purple',
};

/**
 * Compact video status panel for the article detail screen. Renders inside the
 * existing Section/Badge/ActionButton components — no new styling introduced.
 */
export function ArticleVideoPanel({
  articleId, articleStatus, video, enabled,
}: {
  articleId: string;
  articleStatus: string;
  video: ArticleVideo | null;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <Section title="Video">
        <p className="text-sm text-ink-500">
          Short-form video is off. Set <code>MPT_ENABLED=true</code> to generate one from this article.
        </p>
      </Section>
    );
  }

  if (!video) {
    return (
      <Section title="Video">
        <p className="mb-3 text-sm text-ink-500">
          {articleStatus === 'PUBLISHED'
            ? 'No video for this article yet.'
            : 'Videos are generated automatically once the article is published. You can still build one now.'}
        </p>
        <ActionButton action={generateVideoAction} label="Generate video" variant="primary"
          fields={{ id: articleId }} pendingLabel="Queueing…" />
      </Section>
    );
  }

  return (
    <Section title="Video">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={VIDEO_TONES[video.status] ?? 'neutral'}>{video.status.toLowerCase()}</Badge>
          <span className="text-xs text-ink-500">
            {video.aspect} · v{video.version}
            {video.attempts > 0 ? ` · ${video.attempts} attempt${video.attempts === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        {video.videoTitle && <p className="font-medium leading-snug">{video.videoTitle}</p>}

        {video.status === 'COMPLETED' && video.videoUrl && (
          // Served through AutoPress so this works wherever the admin is opened
          // from — MoneyPrinterTurbo itself never has to be publicly reachable.
          <video controls preload="metadata" src={`/api/admin/videos/${video.id}/file`}
            className="w-full rounded-lg border rule bg-ink-950" />
        )}

        {video.status === 'FAILED' && video.error && (
          <p className="rounded-lg bg-red-50 p-2.5 text-xs leading-relaxed text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {truncate(video.error, 400)}
          </p>
        )}

        {video.taskId && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="truncate text-xs text-ink-500">{video.taskId}</code>
            <CopyButton value={video.taskId} label="Copy task ID" />
          </div>
        )}

        {video.script && (
          <details>
            <summary className="cursor-pointer text-xs text-ink-500">Narration script</summary>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-400">{video.script}</p>
          </details>
        )}

        <p className="text-xs text-ink-500">
          Created {formatDate(video.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
          {video.completedAt ? ` · completed ${formatDate(video.completedAt, { timeStyle: 'short' })}` : ''}
        </p>

        <div className="flex flex-wrap gap-2">
          {video.status === 'GENERATING' && (
            <ActionButton action={refreshVideoStatusAction} label="Check status" fields={{ id: video.id }} pendingLabel="Checking…" />
          )}
          {(video.status === 'FAILED' || video.status === 'QUEUED') && (
            <ActionButton action={retryVideoAction} label="Retry" variant="primary" fields={{ id: video.id }} pendingLabel="Retrying…" />
          )}
          <ActionButton action={regenerateVideoAction} label="Regenerate" fields={{ id: video.id }}
            pendingLabel="Queueing…"
            confirmText="Rebuild the script and render a new video for this article?" />
          {video.videoUrl && (
            <Link href={`/api/admin/videos/${video.id}/file`} target="_blank" rel="noopener noreferrer"
              className="btn-secondary px-2.5 py-1 text-xs">
              Open video
            </Link>
          )}
        </div>
      </div>
    </Section>
  );
}
