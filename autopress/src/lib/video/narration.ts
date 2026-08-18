/**
 * Pure text helpers for short-form narration.
 *
 * Separated from video-script.ts (which reaches the LLM and the database) so the
 * rules below — no markdown, no URLs, no citations, no emoji — can be asserted
 * in unit tests without any I/O.
 */

/** Words per minute a TTS voice reads at. Used to size the script. */
export const WORDS_PER_MINUTE = 150;

/** Word budget for a target narration length, with a little headroom. */
export function wordBudget(durationSec: number): { min: number; max: number } {
  const centre = Math.round((durationSec / 60) * WORDS_PER_MINUTE);
  return {
    min: Math.max(40, Math.round(centre * 0.75)),
    max: Math.max(60, Math.round(centre * 1.15)),
  };
}

export function countWordsIn(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

/**
 * Strips everything that must never be spoken aloud: markdown headings and
 * emphasis, list bullets, URLs, bracketed citations, footnote markers and emoji.
 * The result is plain narration prose.
 */
export function sanitizeNarration(raw: string): string {
  let text = String(raw ?? '');

  // Fenced code and inline code never belong in narration.
  text = text.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  // Markdown links and images -> keep the label, drop the target.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Bare URLs and domains.
  text = text.replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' ');
  // Headings, blockquotes and list items are separate thoughts. Stripping the
  // marker alone runs them into the next line ("Quick answer Re encode with..."),
  // so give each one a terminator unless it already ends in punctuation.
  const terminate = (line: string) => {
    const t = line.trim();
    if (!t) return '';
    return /[.!?:;,]$/.test(t) ? t : `${t}.`;
  };
  text = text.replace(/^\s{0,3}#{1,6}\s*(.*)$/gm, (_m, body: string) => terminate(body));
  text = text.replace(/^\s{0,3}>\s?(.*)$/gm, (_m, body: string) => terminate(body));
  text = text.replace(
    /^\s{0,3}(?:[-*+]|\d{1,2}[.)])\s+(.*)$/gm,
    (_m, body: string) => terminate(body),
  );
  // Emphasis markers.
  text = text.replace(/(\*\*|__|\*|_)(.*?)\1/g, '$2');
  // Bracketed citations: [1], [source], (Source: X), footnotes.
  text = text.replace(/\[\s*\d+\s*\]/g, ' ');
  text = text.replace(/\[(?:source|ref|citation)[^\]]*\]/gi, ' ');
  text = text.replace(/\((?:source|via|see)\s*:?[^)]*\)/gi, ' ');
  text = text.replace(/\[\^[^\]]*\]/g, ' ');
  // Emoji and hashtags.
  text = text.replace(EMOJI, ' ').replace(/(^|\s)#[A-Za-z0-9_]+/g, ' ');
  // Table pipes and stray markdown residue.
  text = text.replace(/\|/g, ' ').replace(/^\s*[-=]{3,}\s*$/gm, ' ');

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // Removing a citation leaves "half [1]." -> "half ." Close that gap, and
    // collapse the doubled stops it can create.
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.!?])\1{2,}/g, '$1')
    .trim();
}

/**
 * Splits prose into sentences without breaking inside decimals, version numbers
 * or common abbreviations.
 *
 * The naive /[^.!?]+[.!?]+/ split turns "H.265 (HEVC)" into "H." + "265 (HEVC)",
 * which is how a script ended up narrating "...livestreamed. H." — so the period
 * is masked in those positions before splitting and restored afterwards.
 */
const DOT = '\u0000';
const ABBREVIATIONS = [
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'approx',
  'inc', 'ltd', 'co', 'fig', 'no', 'vol', 'al', 'est', 'dept', 'min', 'max',
];

export function splitSentences(text: string): string[] {
  let masked = text;

  // 1.5, 4.0 — decimals.
  masked = masked.replace(/(\d)\.(\d)/g, `$1${DOT}$2`);
  // H.265, v1.2, MP.4 — a letter followed by a period then an alphanumeric.
  masked = masked.replace(/([A-Za-z])\.(?=[A-Za-z0-9])/g, `$1${DOT}`);
  // e.g. / i.e. — masked above for the inner dot, this catches the trailing one.
  masked = masked.replace(/\b(e\u0000g|i\u0000e)\./gi, `$1${DOT}`);
  // Known abbreviations.
  const abbrev = new RegExp(`\\b(${ABBREVIATIONS.join('|')})\\.`, 'gi');
  masked = masked.replace(abbrev, `$1${DOT}`);
  // Single-letter initials: "J. Smith".
  masked = masked.replace(/\b([A-Z])\.(?=\s+[A-Z])/g, `$1${DOT}`);

  return masked
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.split(DOT).join('.').trim())
    .filter((part) => part.length > 0);
}

/** Words that make useless stock-footage queries. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'without', 'from', 'that', 'this', 'these', 'those',
  'your', 'you', 'our', 'their', 'its', 'how', 'why', 'what', 'when', 'where', 'which',
  'best', 'top', 'guide', 'tips', 'ways', 'need', 'know', 'about', 'into', 'onto',
  'losing', 'loss', 'using', 'used', 'make', 'made', 'get', 'got', 'more', 'most',
  'less', 'least', 'than', 'then', 'but', 'not', 'can', 'will', 'should', 'would',
  'could', 'have', 'has', 'had', 'are', 'was', 'were', 'been', 'being', 'complete',
  'ultimate', 'everything', 'anything', 'really', 'very', 'just', 'also', 'here',
]);

/**
 * Search terms for stock footage.
 *
 * Prefers two-word phrases ("compress video") over bare keywords, because a
 * single abstract word returns unusable B-roll. Stopwords are dropped outright —
 * the old title-splitting version produced terms like "without" and "losing".
 */
export function deriveTerms(title: string, body = '', max = 5): string[] {
  const words = (text: string) =>
    sanitizeNarration(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  const titleWords = words(title);
  const terms: string[] = [];

  // Adjacent survivors from the title make the most filmable phrases.
  for (let i = 0; i < titleWords.length - 1 && terms.length < max; i++) {
    terms.push(`${titleWords[i]} ${titleWords[i + 1]}`);
  }

  // Then the most frequent meaningful words from the article body.
  if (terms.length < max && body) {
    const counts = new Map<string, number>();
    for (const w of words(body)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    for (const w of ranked) {
      if (terms.length >= max) break;
      if (!terms.some((t) => t.includes(w))) terms.push(w);
    }
  }

  for (const w of titleWords) {
    if (terms.length >= max) break;
    if (!terms.some((t) => t.includes(w))) terms.push(w);
  }

  const unique = [...new Set(terms)].slice(0, max);
  return unique.length ? unique : ['technology', 'laptop screen'];
}

/** Trims an over-long script back into range on sentence boundaries. */
export function clampToWords(text: string, maxWords: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  if (words.length <= maxWords) return clean;

  const sentences = splitSentences(clean);
  let out = '';
  for (const sentence of sentences) {
    const candidate = `${out} ${sentence.trim()}`.trim();
    if (countWordsIn(candidate) > maxWords) break;
    out = candidate;
  }
  const trimmed = out.replace(/\s{2,}/g, ' ').trim();
  // If even the first sentence is too long, hard-cut on the word boundary.
  return trimmed.length > 0 ? trimmed : `${words.slice(0, maxWords).join(' ')}.`;
}

/**
 * Guarantees the script ends on a call to action without duplicating one the
 * model already wrote.
 */
export function ensureCta(script: string, cta: string, maxWords: number): string {
  const tail = script.slice(-160).toLowerCase();
  const alreadyHasCta = /read the full|full article|link in bio|on our website|read more/.test(tail);
  if (alreadyHasCta) return script;

  const withCta = `${script.replace(/\s+$/, '')} ${cta}`.trim();
  // The CTA is the point of the video; drop a sentence rather than the CTA.
  if (countWordsIn(withCta) <= maxWords) return withCta;
  return `${clampToWords(script, Math.max(10, maxWords - countWordsIn(cta)))} ${cta}`.trim();
}

/** Short, non-clickbait social title derived from the article title. */
export function deriveTitle(articleTitle: string, max = 80): string {
  // Order matters: sanitizeNarration() strips table pipes, so the " | Site Name"
  // suffix has to go first or the separator is gone before we look for it.
  // Only a *spaced* separator counts — matching a bare hyphen turned
  // "Wi-Fi 7 explained" into "Wi" and "Self-hosting Plex" into "Self".
  const withoutSuffix = String(articleTitle ?? '')
    .replace(/\s+[|–—]\s+[^|–—]{1,40}$/, '')
    .replace(/\s+-\s+[^-]{1,40}$/, '');
  const clean = sanitizeNarration(withoutSuffix).trim();
  const base = clean || articleTitle.trim();
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** 2-4 sentence caption, article-derived, never invented. */
export function deriveDescription(excerpt: string, body: string, max = 400): string {
  const source = sanitizeNarration(excerpt || body);
  const sentences = source.match(/[^.!?]+[.!?]+/g) ?? (source ? [source] : []);
  let out = '';
  for (const sentence of sentences.slice(0, 4)) {
    if ((out + sentence).length > max) break;
    out += sentence;
  }
  const result = out.trim() || source.slice(0, max).trim();
  return result;
}
