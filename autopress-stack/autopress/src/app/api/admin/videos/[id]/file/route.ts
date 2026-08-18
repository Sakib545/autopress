import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { env } from '@/lib/env';
import { extractTaskFile, isSafeTaskId } from '@/lib/video/mpt-url';

export const dynamic = 'force-dynamic';

/**
 * Streams a finished video from MoneyPrinterTurbo through AutoPress.
 *
 * Why this exists: MoneyPrinterTurbo has no authentication of its own, so it
 * must never be published to the internet. On a single machine that is fine —
 * the browser and MPT share localhost — but on any real deployment the admin's
 * browser cannot reach a private service. This route is the bridge: the request
 * is authenticated here, and the fetch to MPT happens server-side over the
 * private network.
 *
 * SSRF note: nothing from the request reaches the upstream URL. The host comes
 * from MPT_API_URL, and the task id and filename come from the database row,
 * re-validated through the same parser used when the URL was stored.
 */

const RANGE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('AUTHOR');
  } catch {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid video id.' }, { status: 400 });
  }

  const video = await prisma.articleVideo.findUnique({
    where: { id },
    select: { taskId: true, videoUrl: true, status: true },
  });
  if (!video) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });
  if (!video.videoUrl) {
    return NextResponse.json({ error: `No file for this video (status ${video.status}).` }, { status: 404 });
  }

  // Rebuild the upstream path from the stored URL rather than trusting it whole.
  const parts = extractTaskFile(video.videoUrl);
  const taskId = parts?.taskId ?? video.taskId;
  if (!parts || !taskId || !isSafeTaskId(taskId)) {
    return NextResponse.json({ error: 'Stored video path is not usable.' }, { status: 409 });
  }

  const upstream =
    `${env.mptApiUrl.replace(/\/$/, '')}` +
    `/api/v1/stream/${encodeURIComponent(taskId)}/${encodeURIComponent(parts.filename)}`;

  // Pass the browser's Range through so seeking in the player works.
  const range = request.headers.get('range');

  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: {
        ...(range ? { Range: range } : {}),
        ...(env.mptApiKey ? { Authorization: `Bearer ${env.mptApiKey}` } : {}),
      },
      // A render can be large; let the platform stream it rather than buffering.
      cache: 'no-store',
    });
  } catch (err) {
    return NextResponse.json(
      { error: `MoneyPrinterTurbo is unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!response.ok && response.status !== 206) {
    return NextResponse.json(
      { error: `MoneyPrinterTurbo returned ${response.status} for this file.` },
      { status: response.status === 404 ? 404 : 502 },
    );
  }

  const headers = new Headers();
  for (const name of RANGE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'video/mp4');
  headers.set('cache-control', 'private, max-age=300');
  headers.set('content-disposition', `inline; filename="${parts.filename}"`);

  return new NextResponse(response.body, { status: response.status, headers });
}
