export type ScoreCard = {
  accuracy: number;
  usefulness: number;
  originality: number;
  readability: number;
  intentMatch: number;
  structure: number;
  seo: number;
  factReliability: number;
  internalLinking: number;
  spamRisk: number;
};

/** Weights sum to 1. Accuracy and fact reliability dominate deliberately —
 *  a fluent article with unverifiable claims is worse than a plain correct one. */
export const WEIGHTS: Record<keyof ScoreCard, number> = {
  accuracy: 0.18,
  factReliability: 0.16,
  usefulness: 0.15,
  intentMatch: 0.12,
  readability: 0.1,
  structure: 0.08,
  originality: 0.08,
  seo: 0.07,
  internalLinking: 0.04,
  spamRisk: 0.02,
};

export function totalScore(card: ScoreCard) {
  let sum = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ScoreCard)[]) {
    // spamRisk is inverted: low risk should raise the score.
    const value = key === 'spamRisk' ? 100 - clamp(card[key]) : clamp(card[key]);
    sum += value * WEIGHTS[key];
  }
  return Math.round(sum);
}

export function clamp(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

export function normalizeCard(raw: Partial<Record<keyof ScoreCard, unknown>>): ScoreCard {
  return {
    accuracy: clamp(raw.accuracy),
    usefulness: clamp(raw.usefulness),
    originality: clamp(raw.originality),
    readability: clamp(raw.readability),
    intentMatch: clamp(raw.intentMatch),
    structure: clamp(raw.structure),
    seo: clamp(raw.seo),
    factReliability: clamp(raw.factReliability),
    internalLinking: clamp(raw.internalLinking),
    spamRisk: clamp(raw.spamRisk),
  };
}

const BANNED_PHRASES = [
  'i tested', 'i personally used', 'in my experience', 'we tested this ourselves',
  'as an ai language model', 'in today\u2019s fast-paced world', "in today's fast-paced world",
  'delve into', 'it is important to note that', 'in conclusion, it is clear',
];

/** Deterministic checks that run regardless of what the reviewer model says. */
export function hardChecks(content: string, opts: { minWords: number; maxWords: number; wordCount: number; authorIsHuman: boolean }) {
  const failures: string[] = [];
  const lower = content.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      const isTestingClaim = phrase.startsWith('i ') || phrase.startsWith('we ');
      if (!isTestingClaim || !opts.authorIsHuman) failures.push(`Contains disallowed phrase: "${phrase}"`);
    }
  }
  if (opts.wordCount < opts.minWords * 0.8) failures.push(`Too short: ${opts.wordCount} words, minimum ${opts.minWords}`);
  if (opts.wordCount > opts.maxWords * 1.3) failures.push(`Too long: ${opts.wordCount} words, maximum ${opts.maxWords}`);
  if (!/^##\s/m.test(content)) failures.push('No H2 headings found');

  return failures;
}
