#!/usr/bin/env bash
set -euo pipefail

KEY_FILE=/root/ollama_api_key

if [[ ! -s "$KEY_FILE" ]]; then
  for source_file in /var/lib/cloud/instance/user-data.txt /var/lib/cloud/instance/user-data.txt.i; do
    if [[ -r "$source_file" ]]; then
      recovered_key="$(grep -oE 'Bearer [A-Za-z0-9._-]+' "$source_file" | head -n1 | cut -d' ' -f2- || true)"
      if [[ -n "$recovered_key" ]]; then
        printf '%s' "$recovered_key" >"$KEY_FILE"
        chmod 600 "$KEY_FILE"
        break
      fi
    fi
  done
fi

if [[ ! -s "$KEY_FILE" ]]; then
  echo "Ollama API key was not found in cloud-init data."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io nginx
systemctl enable --now docker nginx

docker rm -f ollama >/dev/null 2>&1 || true
docker run -d --name ollama --restart unless-stopped \
  -p 127.0.0.1:11434:11434 ollama/ollama:latest

until docker exec ollama ollama list >/dev/null 2>&1; do
  sleep 2
done

docker exec ollama ollama pull qwen2.5:3b

api_key="$(cat "$KEY_FILE")"
cat >/etc/nginx/sites-available/ollama <<NGINX
server {
  listen 8080;
  server_name _;

  client_max_body_size 10m;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  location / {
    if (\$http_authorization != "Bearer $api_key") { return 401; }
    proxy_pass http://127.0.0.1:11434;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
  }
}
NGINX

ln -sf /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/ollama
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

curl -fsS -H "Authorization: Bearer $api_key" http://127.0.0.1:8080/api/tags >/dev/null

echo "Ollama is ready on port 8080 with qwen2.5:3b."
