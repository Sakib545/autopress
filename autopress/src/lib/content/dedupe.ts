import { prisma } from '../db';
import { normalizeTitle } from '../utils';

/** Character trigram set for lexical similarity. */
function trigrams(input: string) {
  const s = ` ${input} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function jaccard(a: string, b: string) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function cosine(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export type DuplicateVerdict = {
  isDuplicate: boolean;
  isNearMatch: boolean;
  score: number;
  matchedTopicId?: string;
  matchedArticleId?: string;
  matchedTitle?: string;
  method: 'exact' | 'lexical' | 'semantic' | 'none';
};

/**
 * Three-stage funnel, cheapest first: exact normalized title, then trigram
 * overlap, then cosine over embeddings. Candidates are bounded so this stays
 * O(few hundred) regardless of archive size.
 */
export async function checkDuplicate(
  title: string,
  embedding: number[],
  threshold: number,
  excludeTopicId?: string,
): Promise<DuplicateVerdict> {
  const normalized = normalizeTitle(title);

  const exact = await prisma.topic.findFirst({
    where: { normalizedTitle: normalized, ...(excludeTopicId ? { id: { not: excludeTopicId } } : {}) },
    select: { id: true, title: true },
  });
  if (exact) {
    return { isDuplicate: true, isNearMatch: false, score: 1, matchedTopicId: exact.id, matchedTitle: exact.title, method: 'exact' };
  }

  const [topics, articles] = await Promise.all([
    prisma.topic.findMany({
      where: {
        status: { in: ['NEW', 'APPROVED', 'QUEUED', 'WRITING', 'PUBLISHED'] },
        ...(excludeTopicId ? { id: { not: excludeTopicId } } : {}),
      },
      select: { id: true, title: true, normalizedTitle: true, embedding: true },
      orderBy: { createdAt: 'desc' },
      take: 400,
    }),
    prisma.article.findMany({
      where: { status: { notIn: ['FAILED', 'ARCHIVED'] } },
      select: { id: true, title: true, embedding: true },
      orderBy: { createdAt: 'desc' },
      take: 400,
    }),
  ]);

  let best: DuplicateVerdict = { isDuplicate: false, isNearMatch: false, score: 0, method: 'none' };

  for (const t of topics) {
    const lex = jaccard(normalized, t.normalizedTitle);
    const sem = embedding.length && t.embedding.length ? cosine(embedding, t.embedding) : 0;
    const score = Math.max(lex, sem);
    if (score > best.score) {
      best = {
        isDuplicate: false,
        isNearMatch: false,
        score,
        matchedTopicId: t.id,
        matchedTitle: t.title,
        method: sem >= lex ? 'semantic' : 'lexical',
      };
    }
  }

  for (const a of articles) {
    const lex = jaccard(normalized, normalizeTitle(a.title));
    const sem = embedding.length && a.embedding.length ? cosine(embedding, a.embedding) : 0;
    const score = Math.max(lex, sem);
    if (score > best.score) {
      best = {
        isDuplicate: false,
        isNearMatch: false,
        score,
        matchedArticleId: a.id,
        matchedTitle: a.title,
        method: sem >= lex ? 'semantic' : 'lexical',
      };
    }
  }

  best.isDuplicate = best.score >= threshold;
  // The grey zone becomes a cluster-merge candidate rather than an outright reject.
  best.isNearMatch = !best.isDuplicate && best.score >= threshold - 0.1;
  return best;
}
