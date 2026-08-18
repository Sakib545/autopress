import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  blue: 'bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-300',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('chip', TONES[tone] ?? TONES.neutral, className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  PUBLISHED: 'green', SCHEDULED: 'blue', READY: 'blue', DRAFTING: 'amber', RESEARCHING: 'amber',
  REVIEWING: 'amber', REWRITING: 'amber', MANUAL_REVIEW: 'purple', FAILED: 'red', ARCHIVED: 'neutral',
  NEW: 'neutral', APPROVED: 'blue', QUEUED: 'blue', WRITING: 'amber', DUPLICATE: 'red', REJECTED: 'red',
  PENDING: 'amber', RUNNING: 'blue', COMPLETED: 'green', CANCELLED: 'neutral', SKIPPED: 'neutral',
  WORKING: 'green', BROKEN: 'red', REDIRECTED: 'amber', UNCHECKED: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function ScoreBadge({ score, min }: { score: number; min: number }) {
  const tone: Tone = score === 0 ? 'neutral' : score >= min ? 'green' : score >= min - 12 ? 'amber' : 'red';
  return <Badge tone={tone}>{score || '—'}</Badge>;
}
