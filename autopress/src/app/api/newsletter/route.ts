import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email().max(200),
  source: z.string().max(60).optional(),
});

/**
 * Provider-agnostic capture: subscribers are stored locally with a confirm
 * token. A sync job can later push them to beehiiv/ConvertKit/Mailchimp using
 * the externalId column — no provider is hardcoded here.
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await rateLimit(`newsletter:${ip}`, 5, 300))) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing && !existing.unsubscribedAt) {
      return NextResponse.json({ ok: true, message: "You're already subscribed." });
    }

    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source: parsed.data.source ?? 'site', confirmToken: randomBytes(24).toString('hex') },
      update: { unsubscribedAt: null, source: parsed.data.source ?? 'site' },
    });

    return NextResponse.json({ ok: true, message: 'Subscribed. Welcome aboard.' });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save your subscription. Please try again.' }, { status: 500 });
  }
}
