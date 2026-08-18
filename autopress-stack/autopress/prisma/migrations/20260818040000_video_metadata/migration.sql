-- Short-form video metadata.
--
-- Additive only: every new column has a default or is nullable, so this applies
-- to a populated database without downtime and without touching existing rows.

-- 1. New pipeline stage between QUEUED and GENERATING.
ALTER TYPE "VideoStatus" ADD VALUE IF NOT EXISTS 'SCRIPTING' AFTER 'QUEUED';

-- 2. Provider, regeneration counter, social copy and dispatch timestamp.
ALTER TABLE "ArticleVideo"
  ADD COLUMN IF NOT EXISTS "provider"         TEXT NOT NULL DEFAULT 'moneyprinterturbo',
  ADD COLUMN IF NOT EXISTS "version"          INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "videoTitle"       TEXT,
  ADD COLUMN IF NOT EXISTS "videoDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt"        TIMESTAMP(3);

-- 3. Index supporting the poller's "oldest un-polled GENERATING row" query.
CREATE INDEX IF NOT EXISTS "ArticleVideo_status_lastPolledAt_idx"
  ON "ArticleVideo" ("status", "lastPolledAt");
