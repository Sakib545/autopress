/**
 * Development seed. Creates an admin account, taxonomy, editorial identity and
 * three fully-formed sample articles so every screen has real data before any
 * API key exists.
 *
 * Sample content is flagged `isSample: true` and is clearly labelled in the
 * admin UI. Remove it with: DELETE FROM "Article" WHERE "isSample" = true;
 *
 * Safe to re-run — everything is upserted by a natural key.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SAMPLE_ARTICLES } from './content';
import { markdownToHtml, addHeadingIds, extractFaqs } from '../../src/lib/content/markdown';
import { slugify, countWords, readingTimeMinutes, normalizeTitle } from '../../src/lib/utils';
import { DEFAULT_SETTINGS } from '../../src/lib/settings';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

const CATEGORIES = [
  { name: 'Video Tools', description: 'Editing, encoding, compression and delivery software for video work.' },
  { name: 'Design Tools', description: 'Image editors, illustration software and design systems.' },
  { name: 'Web Publishing', description: 'Content management, static site tooling and publishing architecture.' },
  { name: 'AI Tools', description: 'Practical guides and comparisons for AI-assisted software.' },
];

async function main() {
  console.log('Seeding…');

  // ---- Admin user -------------------------------------------------------
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN', isActive: true },
    create: { email: ADMIN_EMAIL, name: 'Site Admin', role: 'ADMIN', passwordHash, isActive: true },
  });
  console.log(`  user      ${admin.email}`);

  // ---- Settings ---------------------------------------------------------
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const type =
      typeof value === 'boolean' ? 'BOOLEAN'
      : typeof value === 'number' ? 'NUMBER'
      : typeof value === 'object' ? 'JSON'
      : 'STRING';
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never, type: type as never, group: 'general' },
    });
  }
  console.log(`  settings  ${Object.keys(DEFAULT_SETTINGS).length} keys`);

  // ---- Author -----------------------------------------------------------
  const author = await prisma.author.upsert({
    where: { slug: 'editorial-desk' },
    update: {},
    create: {
      name: 'Editorial Desk',
      slug: 'editorial-desk',
      bio: 'Research-led coverage of software and AI tools. Articles are drafted with AI assistance against verified sources and reviewed before publication. We do not claim hands-on testing unless a named human tested the product.',
      expertise: ['software research', 'tool comparisons', 'technical explainers'],
      isHuman: false,
      isActive: true,
      socialLinks: { website: 'https://example.com' },
    },
  });
  console.log(`  author    ${author.name}`);

  // ---- Categories -------------------------------------------------------
  const categoryMap = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: slugify(c.name) },
      update: { description: c.description },
      create: { name: c.name, slug: slugify(c.name), description: c.description, sortOrder: i, isIndexable: true },
    });
    categoryMap.set(c.name, row.id);
  }
  console.log(`  categories ${CATEGORIES.length}`);

  // ---- Cluster ----------------------------------------------------------
  const cluster = await prisma.contentCluster.upsert({
    where: { slug: 'video-tooling' },
    update: {},
    create: {
      name: 'Video Tooling',
      slug: 'video-tooling',
      description: 'Everything about producing, compressing and publishing video.',
      categoryId: categoryMap.get('Video Tools'),
    },
  });

  // ---- Articles ---------------------------------------------------------
  let created = 0;
  for (const sample of SAMPLE_ARTICLES) {
    const existing = await prisma.article.findUnique({ where: { slug: sample.slug } });
    if (existing) continue;

    const rawHtml = markdownToHtml(sample.markdown);
    const { html } = addHeadingIds(rawHtml);
    const faqs = extractFaqs(html);
    const wordCount = countWords(sample.markdown);
    const categoryId = categoryMap.get(sample.category) ?? null;

    // Topic + research so the provenance chain is complete, not decorative.
    const topic = await prisma.topic.create({
      data: {
        title: sample.title,
        normalizedTitle: normalizeTitle(sample.title),
        status: 'PUBLISHED',
        intent: sample.intent as never,
        contentType: sample.contentType as never,
        categoryId,
        priorityScore: 70,
        commercialScore: sample.intent === 'COMMERCIAL' ? 75 : 30,
        difficulty: 40,
        discoveredBy: 'seed',
        approvedAt: new Date(),
      },
    });

    const research = await prisma.research.create({
      data: {
        topicId: topic.id,
        provider: 'seed',
        summary: 'Sample research bundle created by the development seed. Sources are illustrative.',
        queriesUsed: [sample.primaryKeyword],
        isSufficient: true,
        lastVerifiedAt: new Date(),
      },
    });

    const source = await prisma.researchSource.create({
      data: {
        researchId: research.id,
        url: 'https://example.com/documentation',
        domain: 'example.com',
        title: 'Reference documentation (sample source)',
        credibility: 70,
        isPrimary: true,
        excerpt: 'Placeholder source supplied by the seed so the provenance UI has data to display.',
      },
    });

    await prisma.researchFact.create({
      data: {
        researchId: research.id,
        sourceId: source.id,
        claim: 'Sample verified claim used to demonstrate the fact-check panel.',
        category: 'feature',
        verdict: 'VERIFIED',
        confidence: 0.9,
        isVolatile: false,
        asOfDate: new Date(),
      },
    });

    const publishedAt = new Date(Date.now() - created * 36 * 60 * 60 * 1000);

    const article = await prisma.article.create({
      data: {
        topicId: topic.id,
        title: sample.title,
        subtitle: sample.subtitle,
        slug: sample.slug,
        status: 'PUBLISHED',
        contentType: sample.contentType as never,
        intent: sample.intent as never,
        categoryId,
        clusterId: sample.category === 'Video Tools' ? cluster.id : null,
        authorId: author.id,
        contentMd: sample.markdown,
        contentHtml: html,
        excerpt: sample.excerpt,
        wordCount,
        readingTime: readingTimeMinutes(wordCount),
        seoTitle: `${sample.title} (${new Date().getFullYear()})`.slice(0, 60),
        metaDesc: sample.excerpt.slice(0, 155),
        ogTitle: sample.title,
        ogDesc: sample.excerpt.slice(0, 155),
        canonicalUrl: null,
        isIndexable: true,
        hasVisibleFaq: faqs.length > 0,
        qualityScore: sample.qualityScore,
        factCheckPass: true,
        freshnessTier: sample.contentType === 'BEST_OF' ? 'VOLATILE' : 'STANDARD',
        publishedAt,
        lastCheckedAt: publishedAt,
        nextCheckAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isSample: true,
        isPinned: created === 0,
        viewCount: 120 - created * 30,
      },
    });

    // Featured image via the deterministic SVG cover route — no API key needed.
    const media = await prisma.media.create({
      data: {
        articleId: article.id,
        url: `/api/cover/${article.slug}`,
        altText: `Illustrative cover graphic for the article “${sample.title}”`,
        width: 1200,
        height: 630,
        mimeType: 'image/svg+xml',
        source: 'FALLBACK',
        caption: null,
      },
    });
    await prisma.article.update({ where: { id: article.id }, data: { featuredMediaId: media.id } });

    await prisma.articleSource.create({ data: { articleId: article.id, sourceId: source.id, usedFor: 'background' } });

    // Keywords
    const keywordSpecs = [
      { term: sample.primaryKeyword, role: 'PRIMARY' as const },
      ...sample.secondaryKeywords.map((t) => ({ term: t, role: 'SECONDARY' as const })),
    ];
    for (const spec of keywordSpecs) {
      const keyword = await prisma.keyword.upsert({
        where: { normalizedTerm: normalizeTitle(spec.term) },
        update: {},
        create: {
          term: spec.term,
          normalizedTerm: normalizeTitle(spec.term),
          intent: sample.intent as never,
          commercialScore: spec.role === 'PRIMARY' && sample.intent === 'COMMERCIAL' ? 78 : 35,
          difficulty: 42,
          source: 'seed',
        },
      });
      await prisma.articleKeyword.create({ data: { articleId: article.id, keywordId: keyword.id, role: spec.role } });
      await prisma.topicKeyword.create({ data: { topicId: topic.id, keywordId: keyword.id, role: spec.role } });
    }

    // Tags
    for (const tagName of sample.tags) {
      const tag = await prisma.tag.upsert({
        where: { slug: slugify(tagName) },
        update: { articleCount: { increment: 1 } },
        create: { name: tagName, slug: slugify(tagName), articleCount: 1, isIndexable: false },
      });
      await prisma.articleTag.create({ data: { articleId: article.id, tagId: tag.id } });
    }

    await prisma.articleRevision.create({
      data: {
        articleId: article.id,
        version: 1,
        reason: 'INITIAL',
        summary: 'Created by the development seed.',
        qualityAfter: sample.qualityScore,
        aiProvider: 'seed',
      },
    });

    await prisma.qualityReview.create({
      data: {
        articleId: article.id,
        attempt: 1,
        accuracy: sample.qualityScore,
        usefulness: sample.qualityScore + 2,
        originality: sample.qualityScore - 4,
        readability: sample.qualityScore + 3,
        intentMatch: sample.qualityScore + 1,
        structure: sample.qualityScore,
        seo: sample.qualityScore - 2,
        factReliability: sample.qualityScore,
        internalLinking: sample.qualityScore - 8,
        spamRisk: 6,
        totalScore: sample.qualityScore,
        passed: true,
        feedback: 'Seeded review record so the quality panel renders with real values.',
        reviewerModel: 'seed',
      },
    });

    created++;
  }
  console.log(`  articles  ${created} created`);

  // ---- Cross-link the sample articles ----------------------------------
  const published = await prisma.article.findMany({ where: { isSample: true }, select: { id: true, title: true } });
  for (const from of published) {
    for (const to of published) {
      if (from.id === to.id) continue;
      await prisma.internalLink.upsert({
        where: {
          fromArticleId_toArticleId_anchorHash: {
            fromArticleId: from.id,
            toArticleId: to.id,
            anchorHash: `seed-${to.id.slice(0, 8)}`,
          },
        },
        update: {},
        create: {
          fromArticleId: from.id,
          toArticleId: to.id,
          anchorText: to.title.slice(0, 60),
          anchorHash: `seed-${to.id.slice(0, 8)}`,
          isAutomatic: true,
          contextSection: 'related',
        },
      });
    }
  }

  // ---- Cluster pillar ---------------------------------------------------
  const pillar = await prisma.article.findUnique({ where: { slug: SAMPLE_ARTICLES[0].slug } });
  if (pillar) {
    await prisma.contentCluster.update({ where: { id: cluster.id }, data: { pillarArticleId: pillar.id } });
  }

  // ---- Ad slots (inactive: nothing renders until you add real code) ------
  for (const placement of ['BELOW_INTRO', 'MID_ARTICLE', 'END_ARTICLE', 'SIDEBAR'] as const) {
    await prisma.adSlot.upsert({
      where: { placement_name: { placement, name: 'Default' } },
      update: {},
      create: { placement, name: 'Default', isActive: false, minWordCount: placement === 'MID_ARTICLE' ? 900 : 0 },
    });
  }

  // ---- A pending topic so the pipeline has something to chew on ---------
  const pendingTitle = 'Best AI Video Generators for Small Businesses';
  await prisma.topic.upsert({
    where: { normalizedTitle: normalizeTitle(pendingTitle) },
    update: {},
    create: {
      title: pendingTitle,
      normalizedTitle: normalizeTitle(pendingTitle),
      status: 'APPROVED',
      intent: 'COMMERCIAL',
      contentType: 'BEST_OF',
      categoryId: categoryMap.get('AI Tools'),
      priorityScore: 82,
      commercialScore: 80,
      difficulty: 55,
      discoveredBy: 'seed',
      approvedAt: new Date(),
      angle: 'Focus on budget, ease of use and licensing terms rather than raw feature counts.',
    },
  });

  console.log('\nSeed complete.');
  console.log(`  Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('  Change this password immediately in any deployed environment.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
