# Architecture — Automated Content Publishing Platform

Target deployment: **Railway** (Next.js web service + long-running worker + Redis + Postgres).
Research provider: **interface + mock** for now; Tavily/Serp adapters stubbed behind the same contract.

---

## 1. Service topology

Four Railway services, one repository:

| Service | Start command | Responsibility |
|---|---|---|
| `web` | `next start` | Public site (SSG/ISR), admin dashboard, auth, server actions, internal API |
| `worker` | `tsx worker/index.ts` | BullMQ consumers for every pipeline stage + repeatable schedulers |
| `postgres` | Railway plugin | Primary datastore |
| `redis` | Railway plugin | Queues, distributed locks, response cache |

**Why one repo, two processes:** the worker imports the same `src/lib/**` modules the web app uses (Prisma client, AI providers, prompt templates, scoring). A monorepo with separate packages would add tooling overhead for zero isolation benefit here. Railway deploys the same image twice with different start commands.

**Why not Vercel Cron:** article generation is a 60–240s multi-step chain (research → draft → review → rewrite). Serverless timeouts force awkward checkpointing. A persistent worker with BullMQ gives real retries, backoff, concurrency limits, and rate-limit-aware pacing across AI providers.

```
                    ┌──────────────┐
   browser ────────▶│  web (Next)  │──────┐
                    └──────┬───────┘      │ enqueue
                           │              ▼
                           │        ┌───────────┐
                           │        │   Redis   │
                           │        │  BullMQ   │
                           │        └─────┬─────┘
                           │              │ consume
                           ▼              ▼
                    ┌─────────────────────────────┐
                    │        Postgres             │◀── worker (BullMQ)
                    └─────────────────────────────┘        │
                                                           ▼
                                            AI / Research / Image providers
```

The web service **never** calls an AI provider synchronously during a page request. It only enqueues and reads state. Every long operation is a job row plus a queue message.

---

## 2. The content pipeline

The pipeline is a **state machine persisted on `Topic.status` and `Article.status`**, not an in-memory chain. Each stage is a separate queue; each consumer loads state from Postgres, does one transition, writes back, and enqueues the next stage. A crash resumes from the database, not from scratch.

```
Topic:    DISCOVERED → DEDUPED → SCORED → APPROVED → QUEUED ─┐
                          │                                  │
                          └──▶ DUPLICATE / REJECTED          │
                                                             ▼
Article:  RESEARCHING → DRAFTING → REVIEWING ──(score < min)──▶ REWRITING ─┐
                                       │                                   │
                                       │◀──────────────────────────────────┘
                                       │                    (max attempts)
                                       ├──────────────────────────▶ MANUAL_REVIEW
                                       ▼
                            SEO → LINKING → IMAGING → SCHEDULED → PUBLISHED
                                                            │
                                                            └──▶ FAILED
```

### Queues

| Queue | Trigger | Concurrency |
|---|---|---|
| `topic.discover` | repeatable, daily | 1 |
| `topic.dedupe` | after discover | 4 |
| `topic.score` | after dedupe | 4 |
| `research.build` | after approval | 2 |
| `article.draft` | after research | 2 |
| `article.review` | after draft | 3 |
| `article.rewrite` | review below threshold | 2 |
| `article.seo` | after passing review | 4 |
| `article.link` | after seo | 4 |
| `article.image` | after linking | 3 |
| `publish.run` | repeatable, every 5 min | 1 |
| `refresh.scan` | repeatable, daily | 1 |
| `refresh.update` | after scan | 2 |
| `links.check` | repeatable, weekly | 2 |
| `metrics.sync` | repeatable, daily | 1 |

Repeatable jobs are **schedulers only** — they select candidate rows and enqueue unit-of-work jobs. They never do the work inline, so a slow AI call can't block the tick.

### Idempotency

Three layers, because "cron ran twice" must be harmless:

1. **Deterministic BullMQ `jobId`** — e.g. `article.draft:{articleId}:{attempt}`. BullMQ drops duplicates while the job is active or completed within the retention window.
2. **Status guard inside a transaction** — every consumer opens with `SELECT ... FOR UPDATE` on the row and aborts if the status is not the expected precondition. Two workers racing: one transitions, one no-ops.
3. **Unique constraints** — `Article.slug`, `Topic.normalizedTitle`, `PublishingJob(articleId, scheduledFor)`, `InternalLink(fromArticleId, toArticleId, anchorHash)`. The database is the final arbiter.

Publishing additionally takes a Redis lock (`lock:publish`) so only one process can flip articles live in a given tick.

### Failure isolation

Per-job try/catch writes an `ErrorLog` row and increments `retryCount`. BullMQ handles exponential backoff (3 attempts default, configurable per queue). Terminal failures set the article to `FAILED` or `MANUAL_REVIEW` and emit a `Notification` — they never abort the parent scheduler batch. Image failure specifically falls back to a generated gradient/typographic cover rather than blocking publication. Research failure is the one hard stop: no research, no article.

---

## 3. Provider abstractions

Three independent interfaces, each with a registry and an env-driven default. Every implementation is swappable without touching pipeline code.

```ts
// src/lib/ai/types.ts
interface LLMProvider {
  id: 'openai' | 'anthropic' | 'google'
  complete(req: CompletionRequest): Promise<CompletionResult>   // returns usage
  completeJSON<T>(req: JSONRequest<T>): Promise<JSONResult<T>>  // schema-validated
}

// src/lib/research/types.ts
interface ResearchProvider {
  id: string
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>
  fetch(url: string): Promise<FetchedPage>
}

// src/lib/images/types.ts
interface ImageProvider {
  id: string
  generate(spec: ImageSpec): Promise<GeneratedImage>
}
```

**Model routing per task.** `AI_MODEL_MAP` maps each `AiTask` (`TOPIC_DISCOVERY`, `RESEARCH_SYNTHESIS`, `ARTICLE_WRITING`, `QUALITY_REVIEW`, `SEO_METADATA`, `INTERNAL_LINKING`, `REFRESH_DIFF`) to a `{provider, model}` pair, overridable per-task from admin settings. Cheap models handle SEO metadata and dedupe; the expensive model only writes and reviews.

**Cost tracking is inside the wrapper, not the callers.** `callLLM()` writes an `AIUsage` row on every completion with task, provider, model, token counts, and computed USD cost from a per-model rate table. Budget enforcement reads a cached monthly sum before dispatching any `discretionary` task; `essential` tasks (finishing an in-flight article, publishing) are allowed through so nothing is left half-written.

**Research provider — mock for now.** `MockResearchProvider` returns deterministic fixture hits from `src/lib/research/fixtures/`, so the full pipeline runs end-to-end offline and the seed data is reproducible. `TavilyProvider` and `SerpApiProvider` ship as complete adapters that throw a typed `ProviderNotConfiguredError` when their key is absent — the admin UI surfaces that as an explicit "not configured" state rather than silently faking results. Swapping is a single env var.

---

## 4. Deduplication strategy

Three-stage funnel, cheapest first:

1. **Exact** — normalized title + slug lookup against `Topic` and `Article` (unique index).
2. **Lexical** — Postgres trigram similarity (`pg_trgm`) on `normalizedTitle`, threshold ~0.55.
3. **Semantic** — pgvector cosine distance on a 1536-d embedding of `title + primaryKeyword`, threshold configurable (default 0.88 → `DUPLICATE`, 0.78–0.88 → flagged for cluster merge rather than rejection).

Requires two Postgres extensions, enabled in the initial migration: `pg_trgm`, `vector`.

---

## 5. Settings precedence

`SiteSetting` is a typed key-value table read through `getSettings()` with a 60s Redis cache. Precedence: **admin DB setting → env var → hardcoded default.** Secrets (API keys) are env-only and never readable through the settings API; the admin UI shows only a configured/not-configured boolean.

---

## 6. Rendering strategy

| Route | Strategy |
|---|---|
| `/` | ISR, 5 min revalidate |
| `/[category]/[slug]` | SSG at build + on-demand revalidation on publish/update |
| `/category/[slug]` | ISR, 15 min |
| `/tag/[slug]` | ISR, 1 h, `noindex` unless ≥ N articles |
| `/search` | Server component, `noindex` |
| `/admin/**` | Dynamic, auth-gated, `noindex` |

Publishing calls `revalidatePath()` / `revalidateTag()` so a newly published article appears without a rebuild. Article body is stored as sanitized HTML plus a structured `blocks` JSON, so tables, callouts and FAQs render as real components instead of a `dangerouslySetInnerHTML` blob.

---

## 7. Folder structure

```
.
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│       ├── index.ts                 # dev seed entrypoint
│       ├── demo-articles.ts         # flagged isSample: true
│       └── settings.ts
├── worker/
│   ├── index.ts                     # boots all consumers + schedulers
│   ├── schedulers.ts                # repeatable job registration
│   └── consumers/
│       ├── topic.discover.ts
│       ├── topic.dedupe.ts
│       ├── topic.score.ts
│       ├── research.build.ts
│       ├── article.draft.ts
│       ├── article.review.ts
│       ├── article.rewrite.ts
│       ├── article.seo.ts
│       ├── article.link.ts
│       ├── article.image.ts
│       ├── publish.run.ts
│       ├── refresh.scan.ts
│       ├── refresh.update.ts
│       ├── links.check.ts
│       └── metrics.sync.ts
├── src/
│   ├── app/
│   │   ├── (site)/
│   │   │   ├── page.tsx                     # homepage
│   │   │   ├── [category]/[slug]/page.tsx   # article
│   │   │   ├── category/[slug]/page.tsx
│   │   │   ├── tag/[slug]/page.tsx
│   │   │   ├── author/[slug]/page.tsx
│   │   │   ├── search/page.tsx
│   │   │   └── (legal)/{about,editorial-policy,ai-policy,
│   │   │        corrections,affiliate-disclosure,privacy,contact}/page.tsx
│   │   ├── (admin)/admin/
│   │   │   ├── layout.tsx                   # RBAC gate
│   │   │   ├── page.tsx                     # overview
│   │   │   ├── articles/, topics/, keywords/, research/
│   │   │   ├── categories/, tags/, authors/, media/
│   │   │   ├── automation/, queue/, clusters/
│   │   │   ├── ai-settings/, seo/, affiliate/, ads/
│   │   │   ├── analytics/, logs/, settings/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── admin/**/route.ts            # zod-validated
│   │   │   ├── newsletter/route.ts
│   │   │   ├── revalidate/route.ts
│   │   │   └── health/route.ts
│   │   ├── sitemap.ts
│   │   ├── robots.ts
│   │   └── feed.xml/route.ts
│   ├── components/
│   │   ├── site/                    # Hero, ArticleCard, TOC, FAQ, AuthorBox…
│   │   ├── admin/                   # DataTable, QueueBoard, ScoreBadge…
│   │   ├── ads/                     # AdSlot (placement-driven)
│   │   └── ui/                      # primitives
│   ├── lib/
│   │   ├── db.ts                    # Prisma singleton
│   │   ├── redis.ts
│   │   ├── queues.ts                # queue defs + typed enqueue helpers
│   │   ├── auth.ts                  # Auth.js config + RBAC
│   │   ├── settings.ts
│   │   ├── ai/
│   │   │   ├── types.ts  index.ts  router.ts  cost.ts  budget.ts
│   │   │   ├── providers/{openai,anthropic,google}.ts
│   │   │   └── prompts/{topic,research,write,review,seo,link,refresh}.ts
│   │   ├── research/
│   │   │   ├── types.ts  index.ts
│   │   │   ├── providers/{mock,tavily,serpapi}.ts
│   │   │   └── fixtures/
│   │   ├── images/providers/{ai,stock,fallback}.ts
│   │   ├── content/
│   │   │   ├── templates/            # one per ContentType
│   │   │   ├── scoring.ts            # 10-dimension quality rubric
│   │   │   ├── factcheck.ts
│   │   │   ├── dedupe.ts
│   │   │   ├── internal-links.ts
│   │   │   └── freshness.ts
│   │   ├── seo/{metadata,schema,slug}.ts
│   │   ├── affiliate/{rewrite,disclosure}.ts
│   │   └── validation/               # zod schemas shared by API + actions
│   └── types/
├── .env.example
├── railway.json
└── README.md
```

---

## 8. Security posture

- Auth.js with credentials + optional OAuth; sessions in Postgres via the adapter.
- RBAC enum on `User.role`: `ADMIN`, `EDITOR`, `AUTHOR`, `VIEWER`. Enforced in a single `requireRole()` helper used by the admin layout, every server action, and every `/api/admin` route — never on the client alone.
- All AI/research/image keys are server-only env vars; no `NEXT_PUBLIC_` prefix.
- Zod validation on every mutation boundary.
- Generated HTML passes through a sanitizer allow-list before storage and again before render.
- Redis-backed rate limiting on newsletter signup, search, and login.
- Cron/webhook endpoints require `CRON_SECRET` via constant-time comparison.
- Prisma parameterizes all queries; raw SQL is limited to the two similarity searches and uses tagged templates.

---

## 9. What ships next

This increment is architecture + schema. The proposed order for the following handoffs:

1. Project scaffold, Prisma client, Redis, Auth.js + RBAC, `.env.example`, seed.
2. Provider layer: LLM router, cost/budget, mock research provider, image fallback.
3. Pipeline vertical slice — one topic through to a published article, all queues live.
4. Admin dashboard (overview, articles, queue, automation, AI settings, logs).
5. Public site (homepage, article page, category/tag/author, search) + SEO/schema/sitemap.
6. Refresh, link checker, affiliate, ads, analytics, newsletter.
7. Build, test pass, README.

---

## 10. Open items needing your input later

- **Affiliate networks** — Amazon Associates / Impact / ShareASale each have different link formats; tell me which and I'll implement concrete rewrite rules rather than generic ones.
- **Auth method** — credentials-only, or Google OAuth for the admin?
- **Image provider** — AI generation (DALL·E/Imagen) vs stock (Unsplash/Pexels) as the default. Fallback is built either way.
