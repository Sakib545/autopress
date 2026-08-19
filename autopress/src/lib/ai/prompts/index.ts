import type { SiteConfig } from '../../settings';

const EDITORIAL_RULES = `
Hard editorial rules, no exceptions:
- Never invent statistics, prices, dates, quotes, company facts or product features.
- Use ONLY the supplied research. If a fact is not in the research, omit it or label it clearly as unverified.
- Never write "I tested", "I used", "in my experience" or any first-person testing claim.
- No hype, no filler, no throat-clearing openings ("In today's fast-paced world...").
- Do not repeat the target keyword mechanically. Write for a reader, not a crawler.
- Prefer concrete specifics over generalities. Cut any sentence that carries no information.
`.trim();

export function siteContext(s: SiteConfig) {
  return `Site: ${s.siteName}. Niche: ${s.primaryNiche}. Audience: ${s.targetAudience}. Tone: ${s.writingTone}. Language: ${s.contentLanguage}.`;
}

export function topicDiscoveryPrompt(s: SiteConfig, opts: { count: number; existingTitles: string[]; categories: string[] }) {
  return {
    task: 'TOPIC_DISCOVERY' as const,
    system: `You are a search strategist for an independent publication. ${siteContext(s)}\n${EDITORIAL_RULES}`,
    prompt: `Propose ${opts.count} article topics for this site.

Existing coverage (do NOT duplicate or near-duplicate any of these):
${opts.existingTitles.slice(0, 60).map((t) => `- ${t}`).join('\n') || '- (none yet)'}

Available categories: ${opts.categories.join(', ') || 'none yet'}
Blocked topics: ${s.blockedTopics.join(', ') || 'none'}
Target intent mix: ${Object.entries(s.intentRatios).map(([k, v]) => `${k} ${v}%`).join(', ')}

Each topic must answer a real decision a reader is trying to make. Reject vague or generic ideas.

Return a JSON array only. Each item:
{"title","angle","intent","contentType","primaryKeyword","secondaryKeywords":[],"commercialScore":0-100,"difficulty":0-100,"rationale"}
intent is one of INFORMATIONAL, COMMERCIAL, TRANSACTIONAL, NAVIGATIONAL, COMPARISON, TUTORIAL, NEWS.
contentType is one of STANDARD, HOW_TO, COMPARISON, BEST_OF, ALTERNATIVES, REVIEW, TUTORIAL, EXPLAINER, GLOSSARY, NEWS, RESOURCE.`,
    meta: { niche: s.primaryNiche, audience: s.targetAudience, count: opts.count },
  };
}

export function researchSynthesisPrompt(s: SiteConfig, opts: { topic: string; intent: string; sources: { title: string; url: string; excerpt: string; publishedAt?: string }[] }) {
  return {
    task: 'RESEARCH_SYNTHESIS' as const,
    system: `You are a research analyst. You extract only what the sources actually support. ${EDITORIAL_RULES}`,
    prompt: `Topic: ${opts.topic}
Search intent: ${opts.intent}

Sources:
${opts.sources.map((src, i) => `[${i + 1}] ${src.title} - ${src.url}${src.publishedAt ? ` (${src.publishedAt})` : ''}\n${src.excerpt}`).join('\n\n')}

Extract every checkable fact. Mark anything that changes over time (pricing, tiers, availability, versions, feature lists, company status) as volatile. Where sources disagree, record the conflict rather than picking a winner.

Return JSON only:
{"summary","facts":[{"claim","value","category","isVolatile":bool,"confidence":0-1,"verdict":"VERIFIED|UNVERIFIED|CONFLICTING","sourceIndex":n}],"conflicts","sufficient":bool}
Set "sufficient" to false if the sources do not support a useful article.`,
    meta: { topic: opts.topic },
  };
}

export function articleWritingPrompt(
  s: SiteConfig,
  opts: { title: string; angle: string; intent: string; contentType: string; sections: string[]; primaryKeyword: string; secondaryKeywords: string[]; research: string; targetWords: number },
) {
  return {
    task: 'ARTICLE_WRITING' as const,
    system: `You are a senior editor writing for an independent publication. ${siteContext(s)}\n${EDITORIAL_RULES}`,
    prompt: `Write a ${opts.targetWords}-word article in Markdown.

Title: ${opts.title}
Angle: ${opts.angle}
Search intent: ${opts.intent}
Content type: ${opts.contentType}
Primary keyword: ${opts.primaryKeyword}
Supporting keywords (use naturally, or not at all): ${opts.secondaryKeywords.join(', ')}

Use exactly these sections as H2 headings, in order (the Introduction has no heading):
${opts.sections.map((x) => `- ${x}`).join('\n')}

Research you may draw on (this is your ONLY source of fact):
${opts.research}

Formatting: Markdown only. No H1 (the title is rendered separately). Use tables for comparisons and pricing. Keep paragraphs under four sentences. Where a volatile fact is used, attribute it and note when it was last checked.`,
    meta: { title: opts.title, sections: opts.sections, targetWords: opts.targetWords },
  };
}

export function rewritePrompt(s: SiteConfig, opts: { title: string; weakSections: string[]; feedback: string; content: string; research: string; attempt: number }) {
  return {
    task: 'ARTICLE_REWRITE' as const,
    system: `You are a demanding line editor. ${siteContext(s)}\n${EDITORIAL_RULES}`,
    prompt: `This draft failed quality review. Rewrite ONLY the weak sections; leave the rest byte-identical.

Weak sections: ${opts.weakSections.join(', ') || 'whole article'}
Reviewer feedback: ${opts.feedback}

Research (your only source of fact):
${opts.research}

Current draft:
${opts.content}

Return the full corrected article in Markdown, nothing else.`,
    meta: { title: opts.title, attempt: opts.attempt, sections: opts.weakSections },
  };
}

export function qualityReviewPrompt(s: SiteConfig, opts: { title: string; intent: string; content: string; research: string; attempt: number }) {
  return {
    task: 'QUALITY_REVIEW' as const,
    system: `You are a strict but balanced fact-checking editor. Score every dimension independently from the evidence in the draft. Use 0 only when that dimension is completely absent, and 100 only for exceptional work. Do not invent problems that are not present.`,
    prompt: `Score this draft 0-100 on each dimension.

Title: ${opts.title}
Intended search intent: ${opts.intent}

Research the draft was supposed to rely on:
${opts.research}

Draft:
${opts.content}

Flag every factual claim that is NOT supported by the research above. Flag a first-person testing claim only when the draft actually contains one. spamRisk is inverted: 0 is clean, 100 is spam. Do not give every field the same score, and do not return all zeros unless the draft is empty.

Return JSON only. Every score field must be a JSON number from 0 to 100. Do not omit, rename, or nest fields:
{"accuracy":85,"usefulness":85,"originality":80,"readability":85,"intentMatch":85,"structure":80,"seo":75,"factReliability":85,"internalLinking":70,"spamRisk":10,"weakSections":[],"feedback":"Brief editorial feedback","unverifiedClaims":[]}`,
    meta: { title: opts.title, attempt: opts.attempt },
  };
}

export function seoPrompt(s: SiteConfig, opts: { title: string; primaryKeyword: string; content: string }) {
  return {
    task: 'SEO_METADATA' as const,
    system: `You write metadata that earns clicks honestly. No clickbait, no fabricated superlatives, no year numbers unless the article is genuinely dated.`,
    prompt: `Article title: ${opts.title}
Primary keyword: ${opts.primaryKeyword}

First 1200 characters:
${opts.content.slice(0, 1200)}

Return JSON only:
{"seoTitle" (<=60 chars),"metaDesc" (140-155 chars),"ogTitle","ogDesc","excerpt" (1-2 sentences),"tags":[3-6 lowercase tags]}`,
    meta: { title: opts.title },
  };
}

export function imagePromptPrompt(opts: { title: string; category: string }) {
  return {
    task: 'IMAGE_PROMPT' as const,
    system: `You write image generation prompts for editorial cover art. Never depict real product UIs, logos, brands, or identifiable people. Abstract and conceptual only.`,
    prompt: `Article: ${opts.title}\nCategory: ${opts.category}\nWrite one image prompt, under 60 words, for an abstract editorial cover.`,
    meta: { title: opts.title },
  };
}

export function refreshDiffPrompt(opts: { title: string; content: string; freshFacts: string; publishedAt: string }) {
  return {
    task: 'REFRESH_DIFF' as const,
    system: `You detect staleness. Recommend an update only when something in the article is now wrong or materially incomplete. Cosmetic rewrites are not updates.`,
    prompt: `Article: ${opts.title}
Originally published: ${opts.publishedAt}

Current article:
${opts.content.slice(0, 6000)}

Newly gathered facts:
${opts.freshFacts}

Return JSON only:
{"needsUpdate":bool,"severity":"low|medium|high","reasons":[],"changedSections":[],"staleClaims":[]}`,
    meta: { title: opts.title },
  };
}
