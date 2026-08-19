import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLM, embedText } from '../ai';
import { topicDiscoveryPrompt } from '../ai/prompts';
import { checkDuplicate } from '../content/dedupe';
import { normalizeTitle, safeJson } from '../utils';
import { logError, notify } from '../logging';
import { env } from '../env';
import type { ContentType, SearchIntent } from '@prisma/client';

type RawTopic = {
  title?: string;
  angle?: string;
  intent?: string;
  contentType?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  commercialScore?: number;
  difficulty?: number;
};

const INTENTS: SearchIntent[] = ['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL', 'COMPARISON', 'TUTORIAL', 'NEWS'];
const TYPES: ContentType[] = ['STANDARD', 'HOW_TO', 'COMPARISON', 'BEST_OF', 'ALTERNATIVES', 'REVIEW', 'TUTORIAL', 'EXPLAINER', 'GLOSSARY', 'NEWS', 'RESOURCE'];

const asIntent = (v?: string): SearchIntent => (INTENTS.includes(v as SearchIntent) ? (v as SearchIntent) : 'INFORMATIONAL');
const asType = (v?: string): ContentType => (TYPES.includes(v as ContentType) ? (v as ContentType) : 'STANDARD');

/** Composite ranking: commercial value, achievability, and fit with the
 *  admin's target intent mix relative to what has already been published. */
export function priorityFor(opts: { commercial: number; difficulty: number; intent: SearchIntent; ratios: Record<string, number>; currentMix: Record<string, number> }) {
  const target = opts.ratios[opts.intent] ?? 0;
  const current = opts.currentMix[opts.intent] ?? 0;
  const gap = Math.max(0, target - current);
  return Math.round(opts.commercial * 0.4 + (100 - opts.difficulty) * 0.3 + Math.min(100, gap * 3) * 0.3);
}

export async function runTopicDiscovery(opts: { count?: number } = {}) {
  const settings = await getSettings();
  const requestedCount = opts.count ?? Math.max(4, settings.articlesPerDay * 3);
  const isLocalAi = env.aiProvider === 'local';
  const count = isLocalAi ? Math.min(requestedCount, 4) : requestedCount;

  const [existingTopics, existingArticles, categories, published] = await Promise.all([
    prisma.topic.findMany({ select: { title: true }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.article.findMany({ select: { title: true }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.category.findMany({ select: { name: true } }),
    prisma.article.groupBy({ by: ['intent'], where: { status: 'PUBLISHED' }, _count: true }),
  ]);

  const totalPublished = published.reduce((n, p) => n + p._count, 0) || 1;
  const currentMix: Record<string, number> = {};
  for (const row of published) currentMix[row.intent] = (row._count / totalPublished) * 100;

  const blocked = settings.blockedTopics.map((b) => b.toLowerCase());
  const prompt = topicDiscoveryPrompt(settings, {
    count,
    existingTitles: [...existingTopics, ...existingArticles].map((t) => t.title),
    categories: categories.map((c) => c.name),
  });

  const result = await callLLM({
    ...prompt,
    temperature: 0.9,
    maxTokens: isLocalAi ? 1100 : 3000,
  });
  const raw = safeJson<RawTopic[]>(result.text, []);
  const items = Array.isArray(raw) ? raw : [];

  let created = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const item of items) {
    const title = (item.title ?? '').trim();
    if (!title || title.length < 12) {
      rejected++;
      continue;
    }
    if (blocked.some((b) => title.toLowerCase().includes(b))) {
      rejected++;
      continue;
    }

    const normalized = normalizeTitle(title);
    const embedding = await embedText(`${title} ${item.primaryKeyword ?? ''}`);
    const verdict = await checkDuplicate(title, embedding, settings.duplicateThreshold);

    const intent = asIntent(item.intent);
    const commercial = Math.min(100, Math.max(0, Number(item.commercialScore ?? 40)));
    const difficulty = Math.min(100, Math.max(0, Number(item.difficulty ?? 50)));

    try {
      const topic = await prisma.topic.create({
        data: {
          title,
          normalizedTitle: normalized,
          angle: item.angle ?? null,
          status: verdict.isDuplicate ? 'DUPLICATE' : 'NEW',
          intent,
          contentType: asType(item.contentType),
          commercialScore: commercial,
          difficulty,
          priorityScore: priorityFor({ commercial, difficulty, intent, ratios: settings.intentRatios, currentMix }),
          duplicateOfId: verdict.matchedTopicId ?? null,
          similarityScore: verdict.score,
          rejectionReason: verdict.isDuplicate ? `Too similar to "${verdict.matchedTitle}" (${verdict.method}, ${verdict.score.toFixed(2)})` : null,
          discoveredBy: `${result.provider}:${result.model}`,
          embedding,
        },
      });

      const terms = [item.primaryKeyword, ...(item.secondaryKeywords ?? [])].filter(Boolean) as string[];
      for (const [i, term] of terms.entries()) {
        const normalizedTerm = term.toLowerCase().trim();
        if (!normalizedTerm) continue;
        const keyword = await prisma.keyword.upsert({
          where: { normalizedTerm },
          create: { term, normalizedTerm, intent, commercialScore: commercial, difficulty, source: 'discovery' },
          update: {},
        });
        await prisma.topicKeyword.upsert({
          where: { topicId_keywordId: { topicId: topic.id, keywordId: keyword.id } },
          create: { topicId: topic.id, keywordId: keyword.id, role: i === 0 ? 'PRIMARY' : 'SECONDARY' },
          update: {},
        });
      }

      if (verdict.isDuplicate) duplicates++;
      else created++;
    } catch (err) {
      // Unique index on normalizedTitle is the final dedupe backstop.
      duplicates++;
      await logError({ scope: 'topic.discover', error: err, entityType: 'topic', context: { title } });
    }
  }

  await notify({
    level: created > 0 ? 'SUCCESS' : 'WARNING',
    title: `Topic discovery: ${created} new, ${duplicates} duplicate, ${rejected} rejected`,
    message: `Provider ${result.provider}/${result.model}.`,
  });

  return { created, duplicates, rejected, proposed: items.length };
}

/** Promotes the highest-priority approved topics into the writing queue. */
export async function approveTopTopics(limit: number) {
  const topics = await prisma.topic.findMany({
    where: { status: 'NEW' },
    orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
    take: limit,
  });
  const ids = topics.map((t) => t.id);
  if (ids.length) {
    await prisma.topic.updateMany({ where: { id: { in: ids } }, data: { status: 'APPROVED', approvedAt: new Date() } });
  }
  return topics;
}
