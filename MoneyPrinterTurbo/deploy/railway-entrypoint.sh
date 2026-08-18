#!/usr/bin/env sh
#
# Builds config.toml from environment variables, then starts the API.
#
# Railway has no way to mount a file, and config.toml holds the Pexels key —
# which must never be committed. So the container writes the file at boot from
# env vars you set in the Railway dashboard.
#
# Railway service variables to set:
#   PEXELS_API_KEY   required
#   REDIS_HOST       e.g. redis.railway.internal   (optional)
#   REDIS_PORT       6379                          (optional)
#   REDIS_PASSWORD                                 (optional)
#   PORT             injected by Railway
set -eu

CONFIG=/MoneyPrinterTurbo/config.toml
cp config.example.toml "$CONFIG"

esc() { printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'; }

# Railway private networking is IPv6-only, so binding 0.0.0.0 leaves the service
# unreachable from sibling services. "::" accepts both.
sed -i "s/^listen_host.*/listen_host = \"::\"/" "$CONFIG"
sed -i "s/^listen_port.*/listen_port = ${PORT:-8080}/" "$CONFIG"

if [ -n "${PEXELS_API_KEY:-}" ]; then
  sed -i "s/^pexels_api_keys.*/pexels_api_keys = [\"$(esc "$PEXELS_API_KEY")\"]/" "$CONFIG"
else
  echo "WARNING: PEXELS_API_KEY is not set — every render will fail with no footage." >&2
fi

if [ -n "${REDIS_HOST:-}" ]; then
  sed -i "s/^enable_redis.*/enable_redis = true/" "$CONFIG"
  sed -i "s/^redis_host.*/redis_host = \"$(esc "$REDIS_HOST")\"/" "$CONFIG"
  sed -i "s/^redis_port.*/redis_port = ${REDIS_PORT:-6379}/" "$CONFIG"
  sed -i "s/^redis_password.*/redis_password = \"$(esc "${REDIS_PASSWORD:-}")\"/" "$CONFIG"
fi

echo "[entrypoint] config written; starting MoneyPrinterTurbo on port ${PORT:-8080}"
exec python3 main.py
