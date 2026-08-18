-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'AUTHOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('NEW', 'APPROVED', 'DUPLICATE', 'REJECTED', 'QUEUED', 'WRITING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('RESEARCHING', 'DRAFTING', 'REVIEWING', 'REWRITING', 'MANUAL_REVIEW', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SearchIntent" AS ENUM ('INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL', 'COMPARISON', 'TUTORIAL', 'NEWS');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('STANDARD', 'HOW_TO', 'COMPARISON', 'BEST_OF', 'ALTERNATIVES', 'REVIEW', 'TUTORIAL', 'EXPLAINER', 'GLOSSARY', 'NEWS', 'RESOURCE');

-- CreateEnum
CREATE TYPE "KeywordRole" AS ENUM ('PRIMARY', 'SECONDARY', 'LONG_TAIL');

-- CreateEnum
CREATE TYPE "AiTask" AS ENUM ('TOPIC_DISCOVERY', 'TOPIC_SCORING', 'EMBEDDING', 'RESEARCH_SYNTHESIS', 'FACT_CHECK', 'ARTICLE_WRITING', 'ARTICLE_REWRITE', 'QUALITY_REVIEW', 'SEO_METADATA', 'INTERNAL_LINKING', 'IMAGE_PROMPT', 'IMAGE_GENERATION', 'REFRESH_DIFF', 'VIDEO_SCRIPT');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('TOPIC_DISCOVER', 'TOPIC_DEDUPE', 'TOPIC_SCORE', 'RESEARCH_BUILD', 'ARTICLE_DRAFT', 'ARTICLE_REVIEW', 'ARTICLE_REWRITE', 'ARTICLE_SEO', 'ARTICLE_LINK', 'ARTICLE_IMAGE', 'PUBLISH_RUN', 'REFRESH_SCAN', 'REFRESH_UPDATE', 'LINK_CHECK', 'METRICS_SYNC', 'SITEMAP_REFRESH', 'DB_MAINTENANCE', 'VIDEO_GENERATE', 'VIDEO_POLL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('UNCHECKED', 'WORKING', 'REDIRECTED', 'BROKEN', 'REPLACED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('AI_GENERATED', 'STOCK_API', 'UPLOAD', 'FALLBACK');

-- CreateEnum
CREATE TYPE "RevisionReason" AS ENUM ('INITIAL', 'QUALITY_REWRITE', 'FRESHNESS_UPDATE', 'FACT_CORRECTION', 'BROKEN_LINK_FIX', 'PERFORMANCE_OPTIMIZATION', 'MANUAL_EDIT');

-- CreateEnum
CREATE TYPE "FreshnessTier" AS ENUM ('VOLATILE', 'STANDARD', 'EVERGREEN', 'DATED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('BELOW_INTRO', 'MID_ARTICLE', 'END_ARTICLE', 'SIDEBAR', 'HOMEPAGE_INLINE');

-- CreateEnum
CREATE TYPE "SponsorshipType" AS ENUM ('NONE', 'SPONSORED', 'PAID_PARTNERSHIP', 'ADVERTISEMENT');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "FactVerdict" AS ENUM ('VERIFIED', 'UNVERIFIED', 'CONFLICTING', 'OUTDATED', 'REMOVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "socialLinks" JSONB,
    "isHuman" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "imageUrl" TEXT,
    "seoTitle" TEXT,
    "seoDesc" TEXT,
    "isIndexable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "isIndexable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "ContentCluster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "pillarArticleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "intent" "SearchIntent",
    "commercialScore" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "searchVolume" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "angle" TEXT,
    "status" "TopicStatus" NOT NULL DEFAULT 'NEW',
    "intent" "SearchIntent" NOT NULL,
    "contentType" "ContentType" NOT NULL DEFAULT 'STANDARD',
    "categoryId" TEXT,
    "clusterId" TEXT,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "commercialScore" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "seasonalWindow" TEXT,
    "duplicateOfId" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "rejectionReason" TEXT,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "discoveredBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicKeyword" (
    "topicId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "role" "KeywordRole" NOT NULL DEFAULT 'SECONDARY',

    CONSTRAINT "TopicKeyword_pkey" PRIMARY KEY ("topicId","keywordId")
);

-- CreateTable
CREATE TABLE "Research" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "summary" TEXT,
    "queriesUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT NOT NULL,
    "conflictsNoted" TEXT,
    "isSufficient" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excerpt" TEXT,
    "credibility" INTEGER NOT NULL DEFAULT 50,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFact" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "sourceId" TEXT,
    "claim" TEXT NOT NULL,
    "value" TEXT,
    "category" TEXT,
    "verdict" "FactVerdict" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isVolatile" BOOLEAN NOT NULL DEFAULT false,
    "conflictNote" TEXT,
    "asOfDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSource" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "usedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'RESEARCHING',
    "contentType" "ContentType" NOT NULL DEFAULT 'STANDARD',
    "intent" "SearchIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "categoryId" TEXT,
    "clusterId" TEXT,
    "authorId" TEXT,
    "contentHtml" TEXT,
    "contentMd" TEXT,
    "blocks" JSONB,
    "excerpt" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "readingTime" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "metaDesc" TEXT,
    "ogTitle" TEXT,
    "ogDesc" TEXT,
    "canonicalUrl" TEXT,
    "isIndexable" BOOLEAN NOT NULL DEFAULT true,
    "schemaJson" JSONB,
    "hasVisibleFaq" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "rewriteCount" INTEGER NOT NULL DEFAULT 0,
    "factCheckPass" BOOLEAN NOT NULL DEFAULT false,
    "featuredMediaId" TEXT,
    "freshnessTier" "FreshnessTier" NOT NULL DEFAULT 'STANDARD',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "updatedContentAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "eventDate" TIMESTAMP(3),
    "sponsorship" "SponsorshipType" NOT NULL DEFAULT 'NONE',
    "sponsorName" TEXT,
    "hasAffiliateLinks" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleKeyword" (
    "articleId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "role" "KeywordRole" NOT NULL DEFAULT 'SECONDARY',

    CONSTRAINT "ArticleKeyword_pkey" PRIMARY KEY ("articleId","keywordId")
);

-- CreateTable
CREATE TABLE "ArticleRevision" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "RevisionReason" NOT NULL,
    "summary" TEXT,
    "changedSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentBefore" TEXT,
    "contentAfter" TEXT,
    "diffJson" JSONB,
    "qualityBefore" INTEGER,
    "qualityAfter" INTEGER,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "editorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReview" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "usefulness" INTEGER NOT NULL DEFAULT 0,
    "originality" INTEGER NOT NULL DEFAULT 0,
    "readability" INTEGER NOT NULL DEFAULT 0,
    "intentMatch" INTEGER NOT NULL DEFAULT 0,
    "structure" INTEGER NOT NULL DEFAULT 0,
    "seo" INTEGER NOT NULL DEFAULT 0,
    "factReliability" INTEGER NOT NULL DEFAULT 0,
    "internalLinking" INTEGER NOT NULL DEFAULT 0,
    "spamRisk" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "weakSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedback" TEXT,
    "unverifiedClaims" JSONB,
    "reviewerModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalLink" (
    "id" TEXT NOT NULL,
    "fromArticleId" TEXT NOT NULL,
    "toArticleId" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL,
    "anchorHash" TEXT NOT NULL,
    "contextSection" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "anchorText" TEXT,
    "status" "LinkStatus" NOT NULL DEFAULT 'UNCHECKED',
    "httpStatus" INTEGER,
    "redirectedTo" TEXT,
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "affiliateLinkId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "checkFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "trackingId" TEXT,
    "urlTemplate" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxPerArticle" INTEGER NOT NULL DEFAULT 3,
    "disclosureText" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleVideo" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "taskId" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'QUEUED',
    "script" TEXT,
    "scriptTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "error" TEXT,
    "platform" TEXT,
    "aspect" TEXT NOT NULL DEFAULT '9:16',
    "source" TEXT NOT NULL DEFAULT 'pexels',
    "language" TEXT NOT NULL DEFAULT 'en',
    "voiceName" TEXT,
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "bgMusic" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastPolledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "altText" TEXT NOT NULL,
    "caption" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "blurDataUrl" TEXT,
    "source" "MediaSource" NOT NULL DEFAULT 'AI_GENERATED',
    "sourceUrl" TEXT,
    "license" TEXT,
    "attribution" TEXT,
    "prompt" TEXT,
    "generationCost" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingJob" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "topicId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "task" "AiTask" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 1,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleMetric" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'gsc',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "avgTimeOnPage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmToken" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSlot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "adCode" TEXT,
    "adClient" TEXT,
    "adUnitId" TEXT,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minWordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" "SettingType" NOT NULL DEFAULT 'STRING',
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT,
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "level" "NotificationLevel" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "jobType" "JobType",
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Author_userId_key" ON "Author"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Author_slug_key" ON "Author"("slug");

-- CreateIndex
CREATE INDEX "Author_isActive_idx" ON "Author"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_isIndexable_idx" ON "Tag"("isIndexable");

-- CreateIndex
CREATE INDEX "ArticleTag_tagId_idx" ON "ArticleTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCluster_slug_key" ON "ContentCluster"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCluster_pillarArticleId_key" ON "ContentCluster"("pillarArticleId");

-- CreateIndex
CREATE INDEX "ContentCluster_categoryId_idx" ON "ContentCluster"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_normalizedTerm_key" ON "Keyword"("normalizedTerm");

-- CreateIndex
CREATE INDEX "Keyword_intent_idx" ON "Keyword"("intent");

-- CreateIndex
CREATE INDEX "Keyword_commercialScore_idx" ON "Keyword"("commercialScore");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_normalizedTitle_key" ON "Topic"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Topic_status_priorityScore_idx" ON "Topic"("status", "priorityScore");

-- CreateIndex
CREATE INDEX "Topic_categoryId_idx" ON "Topic"("categoryId");

-- CreateIndex
CREATE INDEX "Topic_intent_idx" ON "Topic"("intent");

-- CreateIndex
CREATE INDEX "TopicKeyword_keywordId_idx" ON "TopicKeyword"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "Research_topicId_key" ON "Research"("topicId");

-- CreateIndex
CREATE INDEX "Research_isSufficient_idx" ON "Research"("isSufficient");

-- CreateIndex
CREATE INDEX "ResearchSource_domain_idx" ON "ResearchSource"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_researchId_url_key" ON "ResearchSource"("researchId", "url");

-- CreateIndex
CREATE INDEX "ResearchFact_researchId_verdict_idx" ON "ResearchFact"("researchId", "verdict");

-- CreateIndex
CREATE INDEX "ResearchFact_isVolatile_idx" ON "ResearchFact"("isVolatile");

-- CreateIndex
CREATE INDEX "ArticleSource_sourceId_idx" ON "ArticleSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSource_articleId_sourceId_key" ON "ArticleSource"("articleId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_topicId_key" ON "Article"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_scheduledFor_idx" ON "Article"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_categoryId_publishedAt_idx" ON "Article"("categoryId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_clusterId_idx" ON "Article"("clusterId");

-- CreateIndex
CREATE INDEX "Article_nextCheckAt_idx" ON "Article"("nextCheckAt");

-- CreateIndex
CREATE INDEX "Article_isSample_idx" ON "Article"("isSample");

-- CreateIndex
CREATE INDEX "ArticleKeyword_keywordId_idx" ON "ArticleKeyword"("keywordId");

-- CreateIndex
CREATE INDEX "ArticleRevision_articleId_createdAt_idx" ON "ArticleRevision"("articleId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRevision_articleId_version_key" ON "ArticleRevision"("articleId", "version");

-- CreateIndex
CREATE INDEX "QualityReview_totalScore_idx" ON "QualityReview"("totalScore");

-- CreateIndex
CREATE UNIQUE INDEX "QualityReview_articleId_attempt_key" ON "QualityReview"("articleId", "attempt");

-- CreateIndex
CREATE INDEX "InternalLink_toArticleId_idx" ON "InternalLink"("toArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLink_fromArticleId_toArticleId_anchorHash_key" ON "InternalLink"("fromArticleId", "toArticleId", "anchorHash");

-- CreateIndex
CREATE INDEX "ExternalLink_articleId_idx" ON "ExternalLink"("articleId");

-- CreateIndex
CREATE INDEX "ExternalLink_status_lastCheckedAt_idx" ON "ExternalLink"("status", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "ExternalLink_domain_idx" ON "ExternalLink"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_domain_key" ON "AffiliateLink"("domain");

-- CreateIndex
CREATE INDEX "AffiliateLink_isActive_idx" ON "AffiliateLink"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleVideo_taskId_key" ON "ArticleVideo"("taskId");

-- CreateIndex
CREATE INDEX "ArticleVideo_status_createdAt_idx" ON "ArticleVideo"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleVideo_articleId_idx" ON "ArticleVideo"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleVideo_articleId_aspect_key" ON "ArticleVideo"("articleId", "aspect");

-- CreateIndex
CREATE INDEX "Media_articleId_idx" ON "Media"("articleId");

-- CreateIndex
CREATE INDEX "Media_source_idx" ON "Media"("source");

-- CreateIndex
CREATE INDEX "PublishingJob_status_scheduledFor_idx" ON "PublishingJob"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "PublishingJob_articleId_scheduledFor_key" ON "PublishingJob"("articleId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_idempotencyKey_key" ON "AutomationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationJob_type_status_idx" ON "AutomationJob"("type", "status");

-- CreateIndex
CREATE INDEX "AutomationJob_createdAt_idx" ON "AutomationJob"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AIUsage_createdAt_idx" ON "AIUsage"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AIUsage_articleId_idx" ON "AIUsage"("articleId");

-- CreateIndex
CREATE INDEX "AIUsage_task_provider_idx" ON "AIUsage"("task", "provider");

-- CreateIndex
CREATE INDEX "ArticleMetric_date_idx" ON "ArticleMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleMetric_articleId_date_source_key" ON "ArticleMetric"("articleId", "date", "source");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_confirmToken_key" ON "NewsletterSubscriber"("confirmToken");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_isConfirmed_idx" ON "NewsletterSubscriber"("isConfirmed");

-- CreateIndex
CREATE INDEX "AdSlot_isActive_idx" ON "AdSlot"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AdSlot_placement_name_key" ON "AdSlot"("placement", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");

-- CreateIndex
CREATE INDEX "SiteSetting_group_idx" ON "SiteSetting"("group");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_scope_createdAt_idx" ON "ErrorLog"("scope", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_isResolved_idx" ON "ErrorLog"("isResolved");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Author" ADD CONSTRAINT "Author_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCluster" ADD CONSTRAINT "ContentCluster_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCluster" ADD CONSTRAINT "ContentCluster_pillarArticleId_fkey" FOREIGN KEY ("pillarArticleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicKeyword" ADD CONSTRAINT "TopicKeyword_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicKeyword" ADD CONSTRAINT "TopicKeyword_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Research" ADD CONSTRAINT "Research_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_featuredMediaId_fkey" FOREIGN KEY ("featuredMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleKeyword" ADD CONSTRAINT "ArticleKeyword_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleKeyword" ADD CONSTRAINT "ArticleKeyword_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevision" ADD CONSTRAINT "ArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevision" ADD CONSTRAINT "ArticleRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_fromArticleId_fkey" FOREIGN KEY ("fromArticleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_toArticleId_fkey" FOREIGN KEY ("toArticleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_affiliateLinkId_fkey" FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVideo" ADD CONSTRAINT "ArticleVideo_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleMetric" ADD CONSTRAINT "ArticleMetric_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
