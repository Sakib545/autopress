import { prisma } from '../db';
import { getSettings } from '../settings';
import { callLLM } from '../ai';
import { researchSynthesisPrompt } from '../ai/prompts';
import { getResearchProvider, credibilityFor } from '../research';
import { safeJson } from '../utils';
import { logError } from '../logging';
import { env } from '../env';
import type { FactVerdict } from '@prisma/client';

type RawFact = {
  claim?: string;
  value?: string;
  category?: string;
  isVolatile?: boolean;
  confidence?: number;
  verdict?: string;
  sourceIndex?: number;
};

type RawResearch = { summary?: unknown; facts?: unknown; conflicts?: unknown; sufficient?: unknown };

const VERDICTS: FactVerdict[] = ['VERIFIED', 'UNVERIFIED', 'CONFLICTING', 'OUTDATED', 'REMOVED'];
const asVerdict = (v?: string): FactVerdict => (VERDICTS.includes(v as FactVerdict) ? (v as FactVerdict) : 'UNVERIFIED');

function researchText(value: unknown, maxLength: number): string | null {
  if (typeof value === 'string') return value.slice(0, maxLength);
  if (Array.isArray(value)) {
    const text = value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .filter(Boolean)
      .join('\n');
    return text ? text.slice(0, maxLength) : null;
  }
  if (value && typeof value === 'object') return JSON.stringify(value).slice(0, maxLength);
  return null;
}

/** Builds the queries the research provider will run for a topic. */
function queriesFor(title: string, keyword: string | null, intent: string) {
  const base = [title];
  if (keyword) base.push(keyword);
  if (intent === 'COMMERCIAL' || intent === 'COMPARISON') base.push(`${title} pricing`, `${title} alternatives`);
  if (intent === 'NEWS') base.push(`${title} latest`);
  return Array.from(new Set(base)).slice(0, 4);
}

/**
 * Builds the research object for a topic. This is a hard gate: if the provider
 * returns nothing usable, isSufficient stays false and no article is drafted.
 */
export async function buildResearch(topicId: string) {
  const settings = await getSettings();
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { keywords: { include: { keyword: true } } },
  });
  if (!topic) throw new Error(`Topic ${topicId} not found`);

  const provider = getResearchProvider();
  const primary = topic.keywords.find((k) => k.role === 'PRIMARY')?.keyword.term ?? null;
  const queries = queriesFor(topic.title, primary, topic.intent);

  const hits: { title: string; url: string; domain: string; excerpt: string; publishedAt?: string; score?: number }[] = [];
  for (const q of queries) {
    try {
      const results = await provider.search(q, { maxResults: 5, preferredDomains: settings.preferredSources.filter((s) => s.includes('.')) });
      hits.push(...results);
    } catch (err) {
      await logError({ scope: 'research.search', error: err, entityType: 'topic', entityId: topicId, context: { query: q } });
    }
  }

  // Deduplicate and rank by topic relevance, search position and source trust.
  // Commercial comparisons prefer product/vendor pages over generic encyclopedia
  // entries, while still allowing independent sources for corroboration.
  const topicTerms = new Set(
    `${topic.title} ${primary ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2 && !['and', 'for', 'the', 'with', 'best', 'top', 'owners', 'comparing'].includes(term)),
  );
  const relevance = (hit: (typeof hits)[number]) => {
    const haystack = `${hit.title} ${hit.domain} ${hit.excerpt}`.toLowerCase();
    let matches = 0;
    for (const term of topicTerms) if (haystack.includes(term)) matches++;
    return topicTerms.size ? matches / topicTerms.size : 0;
  };
  const rank = (hit: (typeof hits)[number]) => {
    const trust = credibilityFor(hit.domain, settings.preferredSources);
    const encyclopediaPenalty =
      (topic.intent === 'COMMERCIAL' || topic.intent === 'COMPARISON') && /wikipedia\.org$/.test(hit.domain) ? 35 : 0;
    return trust + (hit.score ?? 0.5) * 100 + relevance(hit) * 40 - encyclopediaPenalty;
  };

  const byUrl = new Map<string, (typeof hits)[number]>();
  for (const h of hits) if (!byUrl.has(h.url) && relevance(h) >= 0.2) byUrl.set(h.url, h);
  const unique = Array.from(byUrl.values()).sort((a, b) => rank(b) - rank(a)).slice(0, 10);

  // Search snippets are often too shallow for factual writing. Fetch the actual
  // page text for the shortlisted URLs, falling back to the snippet only when a
  // site blocks automated reading.
  const enriched = await Promise.all(
    unique.map(async (hit) => {
      const page = await provider.fetchPage(hit.url).catch(() => null);
      return {
        ...hit,
        title: page?.title || hit.title,
        excerpt: (page?.text || hit.excerpt).slice(0, 4000),
        publishedAt: page?.publishedAt || hit.publishedAt,
      };
    }),
  );

  const research = await prisma.research.upsert({
    where: { topicId },
    create: { topicId, provider: provider.id, queriesUsed: queries, isSufficient: false },
    update: { provider: provider.id, queriesUsed: queries, isSufficient: false, lastVerifiedAt: new Date() },
  });

  await prisma.researchFact.deleteMany({ where: { researchId: research.id } });
  await prisma.researchSource.deleteMany({ where: { researchId: research.id } });

  const sourceRows = [];
  for (const h of enriched) {
    const row = await prisma.researchSource.create({
      data: {
        researchId: research.id,
        url: h.url,
        domain: h.domain,
        title: h.title,
        excerpt: h.excerpt.slice(0, 4000),
        publishedAt: h.publishedAt ? new Date(h.publishedAt) : null,
        credibility: credibilityFor(h.domain, settings.preferredSources),
        isPrimary: credibilityFor(h.domain, settings.preferredSources) >= 85,
      },
    });
    sourceRows.push(row);
  }

  if (!sourceRows.length) {
    await prisma.research.update({
      where: { id: research.id },
      data: { isSufficient: false, summary: 'No sources retrieved. Article generation is blocked.' },
    });
    return { researchId: research.id, sufficient: false, sourceCount: 0, factCount: 0 };
  }

  const prompt = researchSynthesisPrompt(settings, {
    topic: topic.title,
    intent: topic.intent,
    sources: sourceRows.map((s) => ({ title: s.title ?? s.domain, url: s.url, excerpt: s.excerpt ?? '', publishedAt: s.publishedAt?.toISOString() })),
  });

  const result = await callLLM({ ...prompt, temperature: 0.2, maxTokens: env.aiProvider === 'local' ? 1200 : 3000 });
  const parsed = safeJson<RawResearch>(result.text, { facts: [], sufficient: false });

  const facts = Array.isArray(parsed.facts) ? (parsed.facts as RawFact[]) : [];
  let factCount = 0;
  for (const f of facts) {
    if (!f.claim) continue;
    const src = typeof f.sourceIndex === 'number' ? sourceRows[f.sourceIndex - 1] : undefined;
    await prisma.researchFact.create({
      data: {
        researchId: research.id,
        sourceId: src?.id ?? null,
        claim: f.claim.slice(0, 2000),
        value: f.value?.slice(0, 500) ?? null,
        category: f.category ?? null,
        verdict: asVerdict(f.verdict),
        confidence: Math.min(1, Math.max(0, Number(f.confidence ?? 0.5))),
        isVolatile: Boolean(f.isVolatile),
        asOfDate: src?.publishedAt ?? new Date(),
      },
    });
    factCount++;
  }

  const modelMarkedSufficient = parsed.sufficient === true || parsed.sufficient === 'true';
  const hasEnoughEvidence = factCount > 0 && sourceRows.length >= 2;
  // Small local models often omit or mis-shape the advisory flag. Keep the
  // deterministic evidence gate authoritative for the free local path.
  const sufficient = hasEnoughEvidence && (modelMarkedSufficient || env.aiProvider === 'local');
  await prisma.research.update({
    where: { id: research.id },
    data: {
      summary: researchText(parsed.summary, 8000),
      conflictsNoted: researchText(parsed.conflicts, 4000),
      isSufficient: sufficient,
      lastVerifiedAt: new Date(),
    },
  });

  return { researchId: research.id, sufficient, sourceCount: sourceRows.length, factCount };
}

/** Compact, model-readable digest of the research object. */
export async function researchDigest(topicId: string) {
  const research = await prisma.research.findUnique({
    where: { topicId },
    include: { facts: { include: { source: true } }, sources: true },
  });
  if (!research) return { text: 'No research available.', hasVolatile: false, sourceIds: [] as string[] };

  const lines: string[] = [];
  if (research.summary) lines.push(`SUMMARY: ${research.summary}`);
  if (research.conflictsNoted) lines.push(`CONFLICTS: ${research.conflictsNoted}`);
  lines.push('', 'FACTS:');
  for (const f of research.facts) {
    lines.push(
      `- [${f.verdict}${f.isVolatile ? ', VOLATILE' : ''}] ${f.claim}` +
        (f.value ? ` (value: ${f.value})` : '') +
        (f.source ? ` [source: ${f.source.domain}]` : ' [no source: treat as unverified]'),
    );
  }
  lines.push('', 'SOURCES:');
  research.sources.forEach((s, i) => lines.push(`[${i + 1}] ${s.title ?? s.domain} - ${s.url}`));

  return {
    text: lines.join('\n').slice(0, 12_000),
    hasVolatile: research.facts.some((f) => f.isVolatile),
    sourceIds: research.sources.map((s) => s.id),
  };
}
