import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { triggerJob, isTriggerableJob } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: Request) {
  if (!env.cronSecret) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : new URL(request.url).searchParams.get('secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(env.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * External scheduler entrypoint: POST /api/cron/topic.discover with
 * `Authorization: Bearer $CRON_SECRET`. Jobs are idempotent, so a double
 * trigger is harmless.
 */
export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { job } = await params;
  if (!isTriggerableJob(job)) {
    return NextResponse.json({ ok: false, error: `Unknown job "${job}"` }, { status: 404 });
  }

  const result = await triggerJob(job);
  return NextResponse.json({ ok: result.mode !== 'error', ...result }, { status: result.mode === 'error' ? 500 : 200 });
}

export const GET = POST;
