import { callLLMJson } from '../ai';
import { getSettings } from '../settings';
import { env } from '../env';
import { stripMarkdown } from '../content/markdown';
import type { VideoScript } from './types';
import {
  wordBudget, countWordsIn, sanitizeNarration, clampToWords, ensureCta,
  deriveTitle, deriveDescription, deriveTerms, splitSentences,
} from './narration';

/**
 * Turns a published article into short-form narration.
 *
 * The script is derived only from article text that has already passed research
 * and fact checking, so the video inherits the article's verification instead of
 * introducing new claims. If the model is unavailable, over budget, or returns
 * something unusable, a deterministic fallback keeps the pipeline moving —
 * a video job must never be the reason a publish workflow stalls.
 */

const CTA = 'Read the full article on our website.';

function systemPrompt(min: number, max: number, seconds: number) {
  return `You write narration scripts for short vertical social videos (about ${seconds} seconds).

Structure the narration in this order, as flowing spoken prose with no labels:
1. Hook — the first sentence must land in 2-4 seconds and state the reader's real problem or the single most surprising fact.
2. Main insight — the one thing the article establishes.
3. Three to five concrete supporting points, one sentence each.
4. A one-sentence conclusion the viewer can act on.
5. A closing call to action: "${CTA}"

Hard rules:
- Between ${min} and ${max} words. This is a strict range.
- Spoken prose only. No headings, no bullet points, no numbering, no stage directions, no emoji, no hashtags.
- No URLs, no domain names, no citation markers, no source names read aloud.
- Every claim must already appear in the supplied article. Invent nothing.
- No first-person experience claims ("I tested", "I tried") — nobody tested anything.
- No long wind-up. Never open with "in today's video" or "welcome back".

Also return:
- "title": a short, accurate, non-clickbait title under 70 characters.
- "description": 2-4 sentences summarising the article for the post caption.
- "terms": 3-6 stock-footage search terms (1-3 words each, concrete and visual, in English). These drive B-roll selection, so prefer filmable nouns ("laptop screen", "video editing") over abstractions ("efficiency").

Return JSON only: {"script": string, "title": string, "description": string, "terms": string[]}`;
}

/** Deterministic fallback used when the model is unavailable or off-range. */
function fallbackScript(
  title: string,
  excerpt: string,
  body: string,
  budget: { min: number; max: number },
): VideoScript {
  const plain = sanitizeNarration(stripMarkdown(body));
  const sentences = splitSentences(plain);

  let script = excerpt ? `${sanitizeNarration(excerpt)} ` : '';
  for (const sentence of sentences) {
    if (countWordsIn(`${script}${sentence}`) > budget.max) break;
    script += `${sentence.trim()} `;
  }
  script = script.trim();

  if (countWordsIn(script) < budget.min) {
    script = clampToWords(sanitizeNarration(`${title}. ${plain}`), budget.max);
  }
  script = ensureCta(script, CTA, budget.max);

  return {
    script,
    terms: deriveTerms(title, plain),
    wordCount: countWordsIn(script),
    title: deriveTitle(title),
    description: deriveDescription(excerpt, plain),
    fallback: true,
  };
}

export async function buildVideoScript(article: {
  id: string;
  title: string;
  excerpt: string | null;
  contentMd: string | null;
  contentHtml: string | null;
}): Promise<VideoScript> {
  const settings = await getSettings();
  const budget = wordBudget(env.mptVideoDuration);
  const body = article.contentMd ?? stripMarkdown(article.contentHtml ?? '');
  const source = stripMarkdown(body).slice(0, 6000);

  const fallback = fallbackScript(article.title, article.excerpt ?? '', body, budget);
  if (!source.trim()) return fallback;

  try {
    const { data } = await callLLMJson<{
      script?: string;
      title?: string;
      description?: string;
      terms?: string[];
    }>(
      {
        task: 'VIDEO_SCRIPT',
        articleId: article.id,
        system: systemPrompt(budget.min, budget.max, env.mptVideoDuration),
        maxTokens: 900,
        temperature: 0.6,
        prompt: [
          `Article title: ${article.title}`,
          `Audience: ${settings.targetAudience}`,
          `Tone: ${settings.writingTone}`,
          '',
          'Article body:',
          source,
        ].join('\n'),
        meta: { kind: 'video_script', title: article.title, excerpt: article.excerpt ?? '' },
      },
      {},
    );

    const raw = sanitizeNarration(data.script ?? '');
    if (!raw) return fallback;

    let script = clampToWords(raw, budget.max);
    script = ensureCta(script, CTA, budget.max);
    const wordCount = countWordsIn(script);

    // A model that ignored the range is worse than the deterministic fallback.
    if (wordCount < budget.min) return fallback;

    const terms = (data.terms ?? [])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim().toLowerCase().slice(0, 40))
      .slice(0, 6);

    const title = sanitizeNarration(data.title ?? '').slice(0, 90) || fallback.title;
    const description = sanitizeNarration(data.description ?? '').slice(0, 500) || fallback.description;

    return {
      script,
      terms: terms.length ? terms : deriveTerms(article.title, source),
      wordCount,
      title,
      description,
      fallback: false,
    };
  } catch {
    // Budget exhausted, provider down, malformed JSON — the video still ships.
    return fallback;
  }
}

/** Advertised in the admin so an editor knows what length to expect. */
export const VIDEO_SCRIPT_LIMITS = {
  get MIN_WORDS() {
    return wordBudget(env.mptVideoDuration).min;
  },
  get MAX_WORDS() {
    return wordBudget(env.mptVideoDuration).max;
  },
  get TARGET_SECONDS() {
    return env.mptVideoDuration;
  },
};
