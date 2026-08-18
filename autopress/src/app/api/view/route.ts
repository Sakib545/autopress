import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const schema = z.object({ articleId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const allowed = await rateLimit(`view:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  await prisma.article
    .updateMany({ where: { id: parsed.data.articleId, status: 'PUBLISHED' }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
