import { prisma } from './db';
import type { JobType, NotificationLevel } from '@prisma/client';

export async function logError(opts: {
  scope: string;
  error: unknown;
  jobType?: JobType;
  entityType?: string;
  entityId?: string;
  context?: Record<string, unknown>;
}) {
  const err = opts.error as Error;
  const message = err?.message ?? String(opts.error);
  console.error(`[${opts.scope}]`, message);
  await prisma.errorLog
    .create({
      data: {
        scope: opts.scope,
        jobType: opts.jobType ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        message: message.slice(0, 4000),
        stack: err?.stack?.slice(0, 8000) ?? null,
        context: (opts.context ?? {}) as never,
      },
    })
    .catch(() => undefined);
  return message;
}

export async function notify(opts: {
  level: NotificationLevel;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
}) {
  await prisma.notification
    .create({
      data: {
        level: opts.level,
        title: opts.title.slice(0, 200),
        message: opts.message?.slice(0, 2000) ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
      },
    })
    .catch(() => undefined);
}

/** Records a job attempt idempotently. Returns false when already completed. */
export async function claimJob(idempotencyKey: string, type: JobType, payload?: Record<string, unknown>) {
  const existing = await prisma.automationJob.findUnique({ where: { idempotencyKey } });
  if (existing?.status === 'COMPLETED') return null;

  const job = await prisma.automationJob.upsert({
    where: { idempotencyKey },
    create: { idempotencyKey, type, payload: (payload ?? {}) as never, status: 'RUNNING', startedAt: new Date(), attempts: 1 },
    update: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });
  return job;
}

export async function finishJob(id: string, ok: boolean, result?: Record<string, unknown>, error?: string) {
  const job = await prisma.automationJob.findUnique({ where: { id }, select: { startedAt: true } });
  const durationMs = job?.startedAt ? Date.now() - job.startedAt.getTime() : null;
  await prisma.automationJob
    .update({
      where: { id },
      data: {
        status: ok ? 'COMPLETED' : 'FAILED',
        finishedAt: new Date(),
        durationMs,
        result: (result ?? {}) as never,
        lastError: error?.slice(0, 4000) ?? null,
      },
    })
    .catch(() => undefined);
}
