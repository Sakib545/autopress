import { prisma } from '../db';
import type { LinkStatus } from '@prisma/client';

async function probe(url: string): Promise<{ status: LinkStatus; httpStatus: number | null; redirectedTo: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    // Some hosts reject HEAD outright; retry once with a ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-1024' }, signal: controller.signal });
    }
    const redirectedTo = res.url && res.url !== url ? res.url : null;
    if (res.status >= 200 && res.status < 300) {
      return { status: redirectedTo ? 'REDIRECTED' : 'WORKING', httpStatus: res.status, redirectedTo };
    }
    if (res.status >= 400) return { status: 'BROKEN', httpStatus: res.status, redirectedTo };
    return { status: 'WORKING', httpStatus: res.status, redirectedTo };
  } catch {
    return { status: 'BROKEN', httpStatus: null, redirectedTo: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks outbound links. A link is only marked broken after repeated failures,
 * so a transient outage does not strip a legitimate citation.
 */
export async function checkLinks(limit = 50) {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const links = await prisma.externalLink.findMany({
    where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: cutoff } }] },
    orderBy: { lastCheckedAt: 'asc' },
    take: limit,
  });

  let broken = 0;
  let redirected = 0;
  for (const link of links) {
    const result = await probe(link.url);
    const failures = result.status === 'BROKEN' ? link.checkFailures + 1 : 0;
    // Two consecutive failures before we call it broken.
    const status: LinkStatus = result.status === 'BROKEN' && failures < 2 ? link.status : result.status;

    await prisma.externalLink.update({
      where: { id: link.id },
      data: {
        status,
        httpStatus: result.httpStatus,
        redirectedTo: result.redirectedTo,
        checkFailures: failures,
        lastCheckedAt: new Date(),
      },
    });

    if (status === 'BROKEN') broken++;
    if (status === 'REDIRECTED') redirected++;
  }

  // Broken links make the article a refresh candidate on the next scan.
  if (broken > 0) {
    const affected = await prisma.externalLink.findMany({
      where: { status: 'BROKEN' },
      select: { articleId: true },
      distinct: ['articleId'],
    });
    await prisma.article.updateMany({
      where: { id: { in: affected.map((a) => a.articleId) } },
      data: { nextCheckAt: new Date() },
    });
  }

  return { checked: links.length, broken, redirected };
}
