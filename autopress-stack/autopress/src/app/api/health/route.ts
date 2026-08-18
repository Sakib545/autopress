import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRedis } from '@/lib/redis';
import { integrationStatus } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Railway healthcheck target. Returns 200 while the web service can serve
 *  traffic; Redis being absent is reported but is not fatal. */
export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    checks.database = `error: ${(err as Error).message}`;
    healthy = false;
  }

  const redis = getRedis();
  checks.redis = redis ? redis.status : 'not configured (inline mode)';

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, integrations: integrationStatus(), time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
