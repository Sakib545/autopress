/**
 * Transparency pages. Written to describe how this system actually behaves —
 * research-gated generation, AI drafting, automated fact checks, human override.
 * Edit the copy to match your organisation before launch.
 */
export type Policy = { slug: string; title: string; description: string; body: string };

const AI_POLICY = `
## How our content is produced

Articles on this site are drafted by large language models operating inside a fixed editorial pipeline. That pipeline is not "prompt and publish". Every article passes through the following gates before it goes live:

1. **Research first.** A research bundle is assembled from external sources before any writing begins. If the system cannot gather sufficient sources for a topic, the article is never written. There is no fallback to "write it from memory".
2. **Grounded drafting.** The writing model receives the research bundle and is instructed to use it. Claims that cannot be traced to a source are supposed to be omitted.
3. **Automated review.** A separate model scores each draft on accuracy, usefulness, originality, readability, intent match, structure, SEO, fact reliability, internal linking and spam risk. Articles scoring below our configured threshold are rewritten and re-scored.
4. **Manual review fallback.** If an article still fails after the maximum number of rewrites, it is routed to a human instead of published.
5. **Scheduled publication.** Only articles that pass the quality threshold reach the publishing queue.

## What we will not do

- We do not claim to have personally tested a product unless a human actually tested it.
- We do not invent statistics, prices, quotes, release dates or feature lists.
- We do not publish FAQ structured data for FAQs that are not visible on the page.
- We do not generate large volumes of thin pages to target search keywords.

## Limitations

Automated fact checking is not the same as expert verification. Models can misread a source, and sources themselves can be wrong or out of date. Pricing and product features change frequently; we re-check volatile claims on a schedule, but there will be windows where a page is stale. If you find an error, please tell us — see our corrections policy.
`;

const EDITORIAL = `
## Our standard

We publish to be useful to the reader first. A page that ranks but wastes your time is a failure by our standard.

## Sourcing

Claims that can change over time — pricing, availability, features, company details, release dates and statistics — must be supported by a source recorded in our research system. Where sources conflict, we say so rather than picking the convenient number. Where a claim cannot be verified, we remove it or label the uncertainty explicitly.

## Independence

Affiliate relationships never determine our recommendations or rankings. Commercial arrangements are disclosed on the pages they affect. Sponsored content is labelled as sponsored and is not presented as independent editorial judgement.

## Updates

Articles are monitored for staleness on a schedule that depends on the type of content. Pricing-sensitive pages are checked frequently; evergreen explainers less often. When an article changes materially, we update the visible modified date and keep an internal revision record.

## Corrections

We correct errors rather than quietly deleting pages. See our corrections policy.
`;

const CORRECTIONS = `
## Reporting an error

Email us with the page URL and the specific claim you believe is wrong. Include a source if you have one. We read every report.

## How we handle corrections

- **Factual errors** are corrected as soon as they are verified, and the article's updated date is changed.
- **Material corrections** — where the original claim would have changed a reader's decision — get a visible correction note at the foot of the article.
- **Minor fixes** such as typography and broken links are made without a note.

Every change is recorded in an internal revision history including what changed, why, and whether the change was made by a model or a person.
`;

const AFFILIATE = `
## What affiliate links are

Some outbound links on this site are affiliate links. If you click one and buy something, we may receive a commission. This costs you nothing extra.

## How this affects our content

It does not affect what we recommend. Rankings and recommendations are produced by the same editorial pipeline whether or not a merchant has an affiliate programme, and our system limits how many affiliate links may appear in a single article.

## Where disclosure appears

Any article containing affiliate links carries a disclosure near the top of the page, before the first affiliate link.
`;

const PRIVACY = `
## What we collect

- **Analytics.** If analytics is enabled on this deployment, we collect aggregate page-view data. We do not sell it.
- **Newsletter.** If you subscribe, we store your email address and the page you subscribed from, so we can send the newsletter and understand which content converts.
- **Server logs.** Standard request logs, retained for operational and security purposes.

## What we do not do

We do not sell personal data. We do not build advertising profiles of individual readers.

## Your choices

You can unsubscribe from any newsletter email using the link in the footer of that email. To request deletion of your data, contact us.

## Cookies

Cookies are used for essential site function (such as your light/dark theme preference) and, where enabled, analytics and advertising. Your theme preference is stored locally in your browser and never sent to us.
`;

const ABOUT = `
## What this is

An independent publication covering the tools our readers actually use — what they do, what they cost, and which one fits a given job.

## How we work

We run an automated editorial pipeline: topics are selected against reader demand, researched against external sources, drafted with AI assistance, scored against a quality rubric, and published only if they pass. The full detail is in our AI content policy.

## Why you can trust the numbers

Because we do not make them up. Volatile claims are tied to sources, recorded with the date they were verified, and re-checked on a schedule. Where we are unsure, we say so.

## Contact

See the contact page.
`;

const CONTACT = `
## Get in touch

- **Corrections and factual disputes** — include the URL and the specific claim.
- **Partnership and sponsorship enquiries** — note that sponsored content is always labelled and never presented as independent editorial.
- **Press and general enquiries** — welcome.

Replace this text with your real contact address before launch. The contact form is intentionally not enabled by default so that no address is published without your knowledge.
`;

export const POLICIES: Policy[] = [
  { slug: 'about', title: 'About', description: 'What this publication covers and how it is produced.', body: ABOUT },
  { slug: 'editorial-policy', title: 'Editorial Policy', description: 'Our standards for sourcing, independence and updates.', body: EDITORIAL },
  { slug: 'ai-content-policy', title: 'AI Content Policy', description: 'Exactly how AI is used to produce content here, and what we will not do.', body: AI_POLICY },
  { slug: 'corrections-policy', title: 'Corrections Policy', description: 'How to report an error and how we handle it.', body: CORRECTIONS },
  { slug: 'affiliate-disclosure', title: 'Affiliate Disclosure', description: 'How affiliate links work on this site.', body: AFFILIATE },
  { slug: 'privacy-policy', title: 'Privacy Policy', description: 'What we collect and what we do not.', body: PRIVACY },
  { slug: 'contact', title: 'Contact', description: 'How to reach the editorial team.', body: CONTACT },
];

export function getPolicy(slug: string) {
  return POLICIES.find((p) => p.slug === slug);
}
