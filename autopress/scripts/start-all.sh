#!/usr/bin/env bash
#
# Starts the three processes the video pipeline needs, in the background, with
# logs written next to each other so they can be read without a terminal.
#
#   bash scripts/start-all.sh
#
# Stop everything with:  bash scripts/stop-all.sh
set -uo pipefail

AUTOPRESS="$(cd "$(dirname "$0")/.." && pwd)"
MPT="$(cd "$AUTOPRESS/../MoneyPrinterTurbo" 2>/dev/null && pwd || true)"
LOGS="$MPT/_diag"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

if [ -z "$MPT" ]; then
  bad "MoneyPrinterTurbo not found next to autopress. Expected: $AUTOPRESS/../MoneyPrinterTurbo"
  exit 1
fi
mkdir -p "$LOGS"

# Free the ports first. A MoneyPrinterTurbo busy with ffmpeg can take a while to
# die, and starting the new one too early makes it fail with EADDRINUSE and exit
# silently — which looks exactly like "MPT is unreachable" from AutoPress.
release_port() {
  local port="$1" name="$2"
  local pids
  for _ in $(seq 1 15); do
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    [ -z "$pids" ] && { ok "port $port free ($name)"; return 0; }
    kill $pids 2>/dev/null || true
    sleep 1
  done
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    bad "port $port still held after 15s — forcing"
    kill -9 $pids 2>/dev/null || true
    sleep 2
  fi
  [ -z "$(lsof -ti ":$port" 2>/dev/null || true)" ] && ok "port $port free ($name)" || bad "port $port still busy"
}

bold "Stopping anything still running"
pkill -f "python3 main.py" 2>/dev/null || true
pkill -f "tsx watch worker/index.ts" 2>/dev/null || true
pkill -f "tsx worker/index.ts" 2>/dev/null || true
release_port 8080 "MoneyPrinterTurbo"
release_port 3000 "AutoPress dev server"

bold "1/3  Redis"
if redis-cli ping >/dev/null 2>&1; then
  ok "already running"
else
  brew services start redis >/dev/null 2>&1
  sleep 2
  redis-cli ping >/dev/null 2>&1 && ok "started" || bad "could not start Redis — MPT needs it (enable_redis=true)"
fi

bold "2/3  MoneyPrinterTurbo"
cd "$MPT"
nohup python3 main.py > "$LOGS/mpt.log" 2>&1 &
for _ in $(seq 1 12); do
  curl -s -o /dev/null --max-time 3 "http://127.0.0.1:8080/docs" && break
  sleep 2
done
if curl -s -o /dev/null --max-time 5 "http://127.0.0.1:8080/docs"; then
  ok "http://127.0.0.1:8080  (log: _diag/mpt.log)"
else
  bad "did not come up — see $LOGS/mpt.log"
fi

bold "3/3  AutoPress"
cd "$AUTOPRESS"
nohup npm run dev > "$LOGS/dev.log" 2>&1 &
nohup npm run worker:dev > "$LOGS/worker.log" 2>&1 &
sleep 10
if curl -s -o /dev/null --max-time 5 "http://localhost:3000/"; then
  ok "http://localhost:3000  (logs: _diag/dev.log, _diag/worker.log)"
else
  bad "dev server did not come up — see $LOGS/dev.log"
fi

bold "Done. All three run in the background — closing this window will not stop them."
echo "  Logs:  $LOGS"
echo "  Stop:  bash scripts/stop-all.sh"
