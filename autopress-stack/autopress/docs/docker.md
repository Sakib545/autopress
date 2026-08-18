# Running the whole stack with Docker Compose

One command brings up five services: Postgres, Redis, MoneyPrinterTurbo, the
AutoPress web server, and the AutoPress worker.

```bash
cd "path/to/autopress"
docker compose up -d --build
```

Then open <http://localhost:3000>. Follow a service with
`docker compose logs -f worker` (or `web`, `mpt`). Stop with
`docker compose down` — the volumes survive, so no data is lost.

## Layout it expects

```
files/
├── autopress/              ← docker-compose.yml lives here
└── MoneyPrinterTurbo/      ← built from this sibling checkout
```

MoneyPrinterTurbo stays its own service on purpose. It is a Python/ffmpeg
workload with a completely different failure profile, and AutoPress has to keep
publishing articles while it is down. Compose does not merge them — it just
means you no longer start them by hand.

## What Compose overrides

`.env` is read as-is except for four values, because inside Compose
`localhost` means "this container":

| Variable | Value in Compose |
|---|---|
| `DATABASE_URL` | `postgres` service |
| `REDIS_URL` | `redis` service |
| `MPT_API_URL` | `http://mpt:8080` |
| `MPT_PUBLIC_BASE_URL` | `http://127.0.0.1:8080` |

`MPT_PUBLIC_BASE_URL` is the host-side address on purpose: your browser cannot
resolve the service name `mpt`, so finished video links have to point at the
published port.

## Your API keys

MoneyPrinterTurbo's `config.toml` stays the single source of truth and is
mounted read-only. At start-up the container rewrites two values into its own
copy — `listen_host` to `0.0.0.0` so the web container can reach it, and
`redis_host` to `redis`. Your file on disk is never modified, and no key is
baked into an image.

## The database is a fresh one

The `postgres` service creates its own database inside a Docker volume. It is
**not** the Postgres you have been running on your Mac, so the stack starts
empty and `prisma migrate deploy` builds the schema on first boot.

To bring your existing content across:

```bash
# from the host, against your local Postgres
pg_dump autoblog > autoblog.sql
docker compose exec -T postgres psql -U autopress autoblog < autoblog.sql
```

Or keep using your host database instead by removing the `DATABASE_URL`
override from `docker-compose.yml`.

## Notes

- Needs Docker Desktop on macOS.
- The first build is large — the Node image, the Python image, MoneyPrinterTurbo's
  Python dependencies, and its ~200 MB of bundled fonts and music. Later builds
  are cached and quick.
- Only port 3000 is exposed to the network. Postgres, Redis and MoneyPrinterTurbo
  are bound to `127.0.0.1`, which matters because MoneyPrinterTurbo has no
  authentication of its own.
- Migrations run in the `web` service before it serves traffic; the worker waits
  for `web` to be healthy so the two cannot race applying the same migration.

## Without Docker

`bash scripts/start-all.sh` still runs everything directly on the Mac, using
your local Postgres and Redis. Use whichever you prefer — they do not conflict,
but do not run both at once, since they compete for ports 3000 and 8080.
