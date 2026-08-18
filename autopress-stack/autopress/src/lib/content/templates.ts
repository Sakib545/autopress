import type { ContentType, SearchIntent } from '@prisma/client';

/** Section plans per content type. Sections are never force-fitted: each
 *  template lists only what genuinely belongs in that kind of article. */
export const SECTION_TEMPLATES: Record<ContentType, string[]> = {
  STANDARD: ['Introduction', 'Key Takeaways', 'Main Explanation', 'Examples', 'Conclusion'],
  HOW_TO: ['Introduction', 'Quick Answer', 'What You Need', 'Step-by-Step Guide', 'Common Mistakes', 'FAQs', 'Conclusion'],
  COMPARISON: ['Introduction', 'Quick Answer', 'Comparison', 'Where Each One Wins', 'Pricing', 'Which Should You Pick', 'FAQs'],
  BEST_OF: ['Introduction', 'How We Chose', 'Quick Answer', 'The Shortlist', 'Comparison', 'Pricing', 'How to Decide', 'FAQs'],
  ALTERNATIVES: ['Introduction', 'Why Look for an Alternative', 'The Alternatives', 'Comparison', 'Pricing', 'Which Fits Your Case', 'FAQs'],
  REVIEW: ['Introduction', 'Quick Answer', 'What It Does', 'Pros & Cons', 'Pricing', 'Who It Suits', 'Alternatives', 'Conclusion'],
  TUTORIAL: ['Introduction', 'What You Need', 'Step-by-Step Guide', 'Troubleshooting', 'Next Steps'],
  EXPLAINER: ['Introduction', 'Quick Answer', 'Main Explanation', 'Why It Matters', 'Examples', 'FAQs'],
  GLOSSARY: ['Introduction', 'Definitions', 'How These Terms Relate', 'FAQs'],
  NEWS: ['Introduction', 'What Happened', 'Why It Matters', 'What Changes for Users', 'What to Watch'],
  RESOURCE: ['Introduction', 'How to Use This Page', 'The Resources', 'Conclusion'],
};

export const INTENT_DEFAULT_TYPE: Record<SearchIntent, ContentType> = {
  INFORMATIONAL: 'STANDARD',
  COMMERCIAL: 'BEST_OF',
  TRANSACTIONAL: 'REVIEW',
  NAVIGATIONAL: 'EXPLAINER',
  COMPARISON: 'COMPARISON',
  TUTORIAL: 'HOW_TO',
  NEWS: 'NEWS',
};

export function sectionsFor(contentType: ContentType, targetWords: number) {
  const base = SECTION_TEMPLATES[contentType] ?? SECTION_TEMPLATES.STANDARD;
  // Short articles drop optional sections rather than padding every heading.
  if (targetWords < 1000) return base.filter((s) => !['FAQs', 'Examples', 'Pricing'].includes(s));
  return base;
}

/** FAQ schema is only emitted when the template actually renders visible FAQs. */
export function templateHasFaq(contentType: ContentType, targetWords: number) {
  return sectionsFor(contentType, targetWords).includes('FAQs');
}
