# Deploying to Railway

Four services in one Railway project: **Postgres**, **Redis**, **web**,
**worker** — plus **mpt** (MoneyPrinterTurbo) if you want video.

Railway does not read `docker-compose.yml`. Each service is configured on its
own, but they all deploy from Git and talk over Railway's private network.

## The repository

Both projects live in one repository, side by side:

```
files/                    ← the Git repository
├── .gitignore
├── autopress/            → web service    (Root Directory: /autopress)
│                         → worker service (Root Directory: /autopress)
└── MoneyPrinterTurbo/    → mpt service    (Root Directory: /MoneyPrinterTurbo)
```

Railway builds three services from this one repo, each pointed at its own
subdirectory via the **Root Directory** setting.

Push it:

```bash
cd "path/to/files"
gh repo create autopress-stack --private --source=. --push
```

`.gitignore` already excludes `autopress/.env` and
`MoneyPrinterTurbo/config.toml`, so no key is committed — on Railway both are
supplied as environment variables instead.

MoneyPrinterTurbo's 141 MB of CJK `.ttc` fonts are also excluded; renders use
`BeVietnamPro-Bold.ttf`. To follow upstream changes later:

```bash
cd MoneyPrinterTurbo
git remote add upstream https://github.com/harry0703/MoneyPrinterTurbo.git
```

## 1. Postgres and Redis

In the Railway project: **New → Database → Postgres**, then again for **Redis**.
Railway provisions both and exposes `DATABASE_URL` and `REDIS_URL` as reference
variables you can point other services at.

## 2. The web service

**New → GitHub Repo → your repo**, then set **Root Directory** to `/autopress`
so Railway finds the `Dockerfile`. Set these variables (use the reference-variable picker for the
first two so they stay correct if a database is recreated):

```
DATABASE_URL      = ${{Postgres.DATABASE_URL}}
REDIS_URL         = ${{Redis.REDIS_URL}}
NEXTAUTH_SECRET   = <a fresh 32-byte hex string, not the local one>
NEXTAUTH_URL      = https://<your-domain>
NEXT_PUBLIC_SITE_URL = https://<your-domain>
AI_PROVIDER       = openai | anthropic | google
OPENAI_API_KEY    = ...
CRON_SECRET       = <random string>
MPT_ENABLED       = false        # turn on after step 4
```

Settings → **Health Check Path**: `/api/health`.

The existing `railway.json` already runs `prisma migrate deploy` before
`npm run start`, so the schema is applied on every deploy.

## 3. The worker service

Same repo again — **New → GitHub Repo → the same repository**, **Root
Directory** `/autopress`.

- **Start Command**: `npm run worker`
- **Variables**: the same set as the web service
- **No health check and no public domain** — it serves no HTTP

The worker is what actually runs discovery, writing, publishing and video. The
web service alone will not produce content.

## 4. MoneyPrinterTurbo (optional)

Same repository again, with **Root Directory** `/MoneyPrinterTurbo`.

`deploy/railway-entrypoint.sh` writes `config.toml` from environment variables
at boot, so no key is ever committed. Set:

```
PEXELS_API_KEY = <your key>
REDIS_HOST     = redis.railway.internal
REDIS_PORT     = 6379
REDIS_PASSWORD = <from the Redis service>
```

Start command: `sh deploy/railway-entrypoint.sh`.

**Do not give this service a public domain.** MoneyPrinterTurbo has no
authentication — anyone who found the URL could queue renders against your
Pexels quota and your CPU.

Then on both web and worker:

```
MPT_ENABLED = true
MPT_API_URL = http://mpt.railway.internal:8080
```

Leave `MPT_PUBLIC_BASE_URL` empty. Finished videos are streamed through
AutoPress at `/api/admin/videos/<id>/file`, which checks the admin session and
fetches from MPT over the private network — that is what lets MPT stay private.

Add a **Volume** mounted at `/MoneyPrinterTurbo/storage`, or every render is
lost when the container restarts.

## 5. Cron

The scheduled jobs run inside the worker, so nothing extra is needed. If you
prefer Railway's own cron, hit `/api/cron/<job>` with the `CRON_SECRET`.

## Things worth knowing first

- **Private networking is IPv6-only.** A service that binds `0.0.0.0` is
  unreachable at `*.railway.internal`. The MPT entrypoint binds `::` for exactly
  this reason.
- **Video rendering is heavy.** ffmpeg on shared vCPU is slow, and each render
  pulls ~100 MB of Pexels footage. Watch the first few renders before enabling
  `MPT_AUTO_VIDEO`.
- **Storage grows.** Every task keeps its clips and output. Prune
  `storage/tasks/` periodically or the volume fills.
- **Set `MPT_MAX_POLL_MINUTES` higher** than the local 30 if renders are slower
  on Railway hardware.
- **Video is optional.** Deploy steps 1-3 with `MPT_ENABLED=false` and the blog
  works completely. Add step 4 whenever you are ready.
