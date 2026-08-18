# AutoPress — automated AI content publishing platform

A production-shaped publishing system: topic discovery → deduplication → research → writing → fact checking → quality scoring → SEO → internal linking → featured image → scheduled publishing → freshness refresh.

Built on Next.js 15 (App Router), TypeScript, Tailwind, PostgreSQL + Prisma, Redis + BullMQ, Auth.js v5.

**It runs end to end with zero API keys.** Built-in mock providers for AI, research and images let you exercise the entire pipeline locally, and the admin UI clearly labels which integrations are on fallbacks versus live.

---

## Quick start

```bash
npm install
cp .env.example .env            # edit DATABASE_URL at minimum
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev                     # http://localhost:3000
```

Log in at `/login` with the seeded credentials printed by the seed script
(default `admin@example.com` / `changeme123` — change immediately).

To run the background worker in a second terminal:

```bash
npm run worker
```

Without `REDIS_URL` the worker is unnecessary: jobs execute inline in the web process. That is fine for development and wrong for production.

### Required Postgres extensions

The first migration enables them, but your database user needs permission:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
```

`pg_trgm` powers lexical duplicate detection; `vector` powers semantic duplicate detection. On Supabase both are available; on plain Postgres you may need the `pgvector` package installed. If `vector` is unavailable, deduplication falls back to exact + trigram matching only.

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres connection string |
| `NEXTAUTH_SECRET` | **yes in prod** | dev fallback | Session signing. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | in prod | — | Canonical app URL for auth callbacks |
| `NEXT_PUBLIC_SITE_URL` | in prod | `http://localhost:3000` | Canonical URLs, sitemap, OG tags |
| `NEXT_PUBLIC_SITE_NAME` | no | `Signal Review` | Fallback site name before settings are saved |
| `REDIS_URL` | no | — | Enables BullMQ. Without it, jobs run inline |
| `AI_PROVIDER` | no | `mock` | `mock` \| `openai` \| `anthropic` \| `google` |
| `OPENAI_API_KEY` | if used | — | |
| `ANTHROPIC_API_KEY` | if used | — | |
| `GOOGLE_AI_API_KEY` | if used | — | |
| `AI_MODEL_CHEAP` | no | per provider | Override the cheap tier (SEO, linking, discovery) |
| `AI_MODEL_WRITING` | no | per provider | Override the premium tier (writing, rewriting) |
| `AI_MODEL_REVIEW` | no | per provider | Override the quality-review model |
| `RESEARCH_PROVIDER` | no | `mock` | `mock` \| `tavily` \| `serpapi` |
| `TAVILY_API_KEY` | if used | — | |
| `SERPAPI_API_KEY` | if used | — | |
| `IMAGE_PROVIDER` | no | `fallback` | `fallback` \| `stock` \| `ai` |
| `UNSPLASH_ACCESS_KEY` | if stock | — | |
| `IMAGE_API_KEY` | if ai | — | |
| `CRON_SECRET` | in prod | — | Bearer token for `/api/cron/[job]` |
| `MONTHLY_AI_BUDGET_USD` | no | `50` | Spend cap; discretionary tasks stop when hit |
| `WORKER_CONCURRENCY` | no | `2` | Parallel jobs per worker |
| `NEXT_PUBLIC_GA_ID` | no | — | GA4 measurement ID |
| `SHOW_SAMPLE_CONTENT` | no | `true` | Set `false` to hide seeded demo articles |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | see above | Seed credentials |

Secrets are read server-side only. Nothing except `NEXT_PUBLIC_*` reaches the browser, and the settings API never returns values marked secret.

---

## How the automation works

The pipeline is a **state machine persisted in Postgres**, not an in-memory chain. Each stage loads state, performs one transition, writes back, and enqueues the next. A crash mid-article resumes from the database.

```
Topic:   NEW → APPROVED → QUEUED ──► DUPLICATE / REJECTED
Article: RESEARCHING → DRAFTING → REVIEWING ──(below min score)──► REWRITING ──┐
                            │                                                  │
                            │◄─────────────────────────────────────────────────┘
                            │            (max attempts exceeded)
                            ├──────────────────────────────► MANUAL_REVIEW
                            ▼
                  SEO → LINKING → IMAGING → SCHEDULED → PUBLISHED
```

### Stage behaviour

- **Discovery** generates ideas from your niche, categories, intent-ratio gaps and previously successful content. Blocked topics are filtered here.
- **Deduplication** runs three tiers, cheapest first: exact slug/title, `pg_trgm` lexical similarity, then vector cosine similarity. Above `duplicateThreshold` the topic is rejected with a link to the original.
- **Research** builds a `Research` bundle of sources and discrete `ResearchFact` rows. `isSufficient` defaults to false and **blocks drafting** — no research, no article.
- **Writing** selects a template per content type. The prompt receives research facts, not free rein. Word count, tone and audience come from settings.
- **Fact checking** marks every volatile claim (pricing, versions, availability) with a verdict. Unverifiable claims are removed or explicitly hedged, never invented.
- **Quality review** scores ten dimensions 0–100. Below `minQualityScore`, weak sections are rewritten and rescored up to `maxRewriteAttempts`, then the article goes to manual review rather than publishing.
- **SEO** generates title, meta, OG tags, Article and Breadcrumb schema. FAQ schema is emitted **only** when visible FAQs exist in the body.
- **Internal linking** finds relevant published articles and inserts contextual links, capped per 1,000 words, with anchor-text variation enforced by a uniqueness constraint.
- **Imaging** tries the configured provider, then falls back to a deterministic SVG cover at `/api/cover/[slug]` — so nothing publishes without artwork.
- **Publishing** assigns the next free slot from `publishTimes`. If `autoPublish` is off, articles stop at `READY` for human release.
- **Refresh** re-checks articles past `nextCheckAt`, tier-based: volatile (pricing) often, evergreen rarely, news recorded but not endlessly rewritten.

### Idempotency

Three independent layers, so a double-fired cron is harmless:

1. Deterministic BullMQ `jobId` per unit of work.
2. Status guards inside a transaction — a consumer aborts if the row is not in the expected precondition state.
3. Unique constraints, notably `PublishingJob(articleId, scheduledFor)`.

---

## Short-form video (MoneyPrinterTurbo)

MoneyPrinterTurbo generates vertical social videos. It runs as a **separate service** and is reached over HTTP only — no part of it is vendored into this application.

### Setup

```bash
# 1. Run MoneyPrinterTurbo separately (its own repo)
git clone https://github.com/harry0703/MoneyPrinterTurbo
cd MoneyPrinterTurbo
docker compose up -d          # API listens on :8080

# 2. Point AutoPress at it
MPT_ENABLED="true"
MPT_API_URL="http://127.0.0.1:8080"
```

Add your Pexels or Pixabay key inside MoneyPrinterTurbo's own config, not here.

### The flow

```
Article reaches PUBLISHED
   └─► requestArticleVideo()      creates ArticleVideo row (QUEUED)
        └─► video.generate queue
             ├─► buildVideoScript()      100-150 word narration + B-roll terms
             ├─► POST /api/v1/videos     → task_id saved, status GENERATING
             └─► video.poll queue (every 2 min)
                  └─► GET /api/v1/tasks/{task_id}
                       ├─ COMPLETE → videoUrl saved, status COMPLETED
                       └─ FAILED   → error saved, retried up to maxAttempts
                            └─► optional: mark PUBLISHED to a social platform
```

### Publishing never waits on video

This is enforced structurally, not by convention:

- The hook fires **after** the publish transaction has committed. The article is already live.
- `triggerVideoForPublishedArticle()` catches every error and returns a reason instead of throwing.
- No HTTP call to MoneyPrinterTurbo happens on the publish path — only a queue enqueue.
- If MPT is offline, `VideoServiceUnavailableError` leaves the row `QUEUED` and the 10-minute sweep retries it. The article is untouched.

### Duplicate prevention

`@@unique([articleId, aspect])` on `ArticleVideo`. A second request for the same article and aspect cannot create a second row, so the publish hook is safe to fire repeatedly. Retryable failures reset the existing row rather than inserting a new one.

### Script generation

Scripts are derived from article text that already passed research and fact checking, so the video inherits the article's verification rather than introducing new claims. The prompt bans first-person testing claims and subscribe prompts. If the model is unavailable or returns an out-of-range script, a deterministic extractive fallback runs instead — video generation never hard-fails on the script step.

### Admin

**Admin → Videos** shows queued, generating, completed, failed and published counts, each row's task ID, the generated script and B-roll terms, the video URL, and per-row Retry / Check status / Mark published / Delete actions. **Admin → Site Settings → Short-form video** controls auto generation, format (9:16, 16:9, 1:1), source (Pexels, Pixabay, local), subtitles, background music, voice, eligible categories and the daily cap.

### Video environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MPT_ENABLED` | `false` | Master switch. Everything else is inert while false |
| `MPT_API_URL` | `http://127.0.0.1:8080` | MoneyPrinterTurbo API base |
| `MPT_PUBLIC_URL` | — | Public base if MPT returns relative paths from another host |
| `MPT_API_KEY` | — | Bearer token if MPT sits behind an auth proxy |
| `MPT_AUTO_VIDEO` | `true` | Seeds the "auto generate" setting default |
| `MPT_VIDEO_ASPECT` | `9:16` | `9:16` \| `16:9` \| `1:1` |
| `MPT_VIDEO_SOURCE` | `pexels` | `pexels` \| `pixabay` \| `local` |
| `MPT_VIDEO_LANGUAGE` | `en` | Narration language |
| `MPT_VIDEO_COUNT` | `1` | Variations per article |

---

## Scheduling & cron

Two ways to drive the schedulers.

**Worker (recommended, Railway).** `npm run worker` registers BullMQ repeatable jobs. Nothing else to configure.

**HTTP cron.** Call the endpoint from any external scheduler:

```
POST https://your-app/api/cron/topic.discover
Authorization: Bearer $CRON_SECRET
```

Valid jobs: `topic.discover`, `publish.run`, `refresh.scan`, `links.check`, `video.generate`, `video.poll`.

Suggested cadence: discovery daily, publish every 5–15 minutes, refresh daily, link check weekly.

Every job is also runnable on demand from **Admin → Automation**, using the same code path, so behaviour cannot drift between manual and scheduled execution.

---

## Deploying on Railway

1. **Create the project** — New Project → Deploy from GitHub repo.
2. **Add Postgres** — New → Database → PostgreSQL. Railway injects `DATABASE_URL`.
3. **Add Redis** — New → Database → Redis. Railway injects `REDIS_URL`.
4. **Enable extensions** — open the Postgres shell and run the two `CREATE EXTENSION` statements above.
5. **Configure the web service:**
   - Build: `npm ci && npm run build`
   - Start: `npx prisma migrate deploy && npm start`
   - Variables: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, plus any provider keys.
   - Generate a domain under Settings → Networking.
6. **Add the worker service** — New → GitHub Repo → same repository.
   - Build: `npm ci && npx prisma generate`
   - Start: `npm run worker`
   - Share the same variables (reference the same Postgres and Redis).
   - No domain needed; it is not an HTTP service.
7. **Seed once** (optional, for demo content): `railway run npm run db:seed`
8. **Log in**, change the admin password, then configure your niche in **Admin → Site Settings** before enabling automation.

Both services deploy from one repository with different start commands, sharing `src/lib/**`.

### Other platforms

Vercel works for the web service, but serverless timeouts make long generations awkward — run the worker on Railway/Render/Fly and point both at the same database. Render and Fly.io both support the two-service split natively.

---

## Configuration guide

**Change niche:** Admin → Site Settings → Niche & audience. Primary niche, secondary niches, audience and tone all feed the discovery and writing prompts directly. Be specific; vague niches produce generic topics.

**Change AI models:** set `AI_PROVIDER`, and optionally the three tier overrides. Routing sends cheap work (SEO metadata, linking, discovery) to a small model and reserves the premium model for writing. Rates live in `src/lib/ai/cost.ts` — update them when provider pricing changes, since cost is computed from that table at call time.

**Affiliate links:** Admin → Affiliate. Add merchant + bare domain + affiliate URL or template (`{url}`, `{trackingId}`). Matching outbound links are rewritten at publish time, capped per article. Disclosure renders automatically on any article containing one.

**Ads:** Admin → Ad Slots. Inactive slots render nothing — no placeholder, no layout shift. Paste real network code and activate.

**Content safety:** Blocked topics in settings reject matching ideas at discovery. Medical, legal and investment advice are blocked by default. Remove them only if you have genuine expert review in place.

---

## Editorial integrity

These are enforced in code, not just documented:

- AI-assisted bylines cannot generate first-person testing claims. `Author.isHuman` gates it, and the writing prompt reads that flag.
- FAQ schema is only emitted when visible FAQs exist on the page.
- Claims that research cannot verify are removed or hedged, never invented.
- Empty categories and thin tag pages are excluded from the sitemap regardless of their indexing switch.
- Sponsored content is labelled on the article record and rendered with a visible marker.
- Sample seed content is flagged `isSample` and visibly labelled in the admin.

---

## Project layout

```
prisma/schema.prisma     22 models, enums, indexes
prisma/seed/             dev seed (admin, taxonomy, 3 full sample articles)
worker/                  BullMQ consumers + repeatable schedulers
src/app/(site)/          public blog
src/app/(admin)/admin/   dashboard (15 screens)
src/app/api/             auth, cron, health, newsletter, cover images
src/actions/             server actions, all RBAC + zod guarded
src/lib/ai/              provider abstraction, routing, cost, budget
src/lib/research/        research providers (mock, tavily, serpapi)
src/lib/images/          image providers (fallback, stock, ai)
src/lib/video/           MoneyPrinterTurbo client, script builder, types
src/lib/content/         dedupe, scoring, linking, freshness, templates
src/lib/pipeline/        one module per pipeline stage
src/lib/seo/             metadata, schema, slugs
```

---

## Maintenance

**Backup:** `pg_dump "$DATABASE_URL" -Fc -f backup.dump`
**Restore:** `pg_restore -d "$DATABASE_URL" --clean --if-exists backup.dump`
**Remove sample content:** `DELETE FROM "Article" WHERE "isSample" = true;`

### Troubleshooting

| Symptom | Cause |
|---|---|
| `Unknown argument embedding` | Run `npx prisma generate` after schema changes |
| `type "vector" does not exist` | `CREATE EXTENSION vector;` not run |
| Jobs never execute | No `REDIS_URL`, or the worker service is not running |
| Articles stuck at `MANUAL_REVIEW` | Quality below `minQualityScore` after max rewrites — lower the threshold or improve research |
| Articles stuck at `READY` | `autoPublish` is off — expected behaviour |
| Everything says "fallback" | No provider keys set — the platform is working, using mocks |
| Videos stay `QUEUED` | MPT unreachable, or the worker is not running. Use Admin → Videos → Test connection |
| Videos stay `GENERATING` | Poll tick not running; tasks older than 60 min auto-fail |
| "A 9:16 video already exists" | Duplicate prevention working as designed — delete the row to regenerate |
| Canonical URLs point to localhost | Set `NEXT_PUBLIC_SITE_URL` |
| `401` from cron | Missing or wrong `Authorization: Bearer $CRON_SECRET` |

---

## Commands

```bash
npm run dev            # dev server
npm run build          # prisma generate + next build
npm start              # production server
npm run worker         # BullMQ worker
npm run typecheck      # tsc --noEmit
npm run db:migrate:dev # create + apply a migration
npm run db:migrate     # apply migrations (production)
npm run db:seed        # seed demo data
npm run db:studio      # Prisma Studio
```
