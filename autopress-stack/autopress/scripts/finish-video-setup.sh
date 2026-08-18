#!/usr/bin/env bash
#
# One-shot finisher for the MoneyPrinterTurbo video integration.
#
# Everything here has already been verified except the two steps that need your
# machine: applying the migration (your Postgres) and the production build.
# Safe to re-run — the migration is idempotent and nothing here is destructive.
#
#   bash scripts/finish-video-setup.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

bold "1/6  Checking the database is reachable"
if ! node -e '
require("dotenv").config();
const u = new URL(process.env.DATABASE_URL);
const net = require("net");
const s = net.connect({ host: u.hostname, port: Number(u.port || 5432) });
s.setTimeout(4000);
s.on("connect", () => { s.end(); process.exit(0); });
s.on("timeout", () => { s.destroy(); process.exit(1); });
s.on("error", () => process.exit(1));
'; then
  warn "Postgres is not accepting connections on the host in DATABASE_URL."
  warn "Start it (e.g. 'brew services start postgresql@16') and run this again."
  exit 1
fi
ok "database reachable"

bold "2/6  Applying the migration"
# 'deploy' rather than 'dev': the migration SQL is hand-written and already
# verified, and deploy never prompts to reset or drops anything.
npx prisma migrate deploy
ok "20260818040000_video_metadata applied"

bold "3/6  Regenerating the Prisma client"
npx prisma generate >/dev/null
ok "client regenerated from prisma/schema.prisma"

bold "4/6  Typecheck, lint, tests"
npm run typecheck && ok "tsc clean"
npx next lint --max-warnings=0 && ok "lint clean"
npm test && ok "tests passed"

bold "5/6  Production build"
npm run build
ok "build succeeded"

bold "6/6  Removing stale caches"
if [ -d .to-delete ]; then
  rm -rf .to-delete
  ok "removed .to-delete/"
else
  ok "nothing to clean"
fi

bold "Done."
cat <<'TXT'
  The video pipeline is live but idle: MPT_ENABLED is still "false",
  so nothing calls MoneyPrinterTurbo and the blog is unaffected.

  To turn it on, see docs/moneyprinterturbo.md, then set in .env:

      MPT_ENABLED="true"
      MPT_API_URL="http://127.0.0.1:8080"

  and restart both `npm run dev` and `npm run worker`.
TXT
