#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${1:?usage: deploy-ip.sh <host> [user] [ssh-port] [app-port]}"
VPS_USER="${2:-ubuntu}"
SSH_PORT="${3:-22}"
APP_PORT="${4:-3000}"
REMOTE_DIR="/home/${VPS_USER}/inductor-app"
ARCHIVE="/tmp/inductor-app.tar.gz"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${GUOXUAN_BOOTSTRAP_PASSWORD:-}" ]]; then
  echo "请先设置 GUOXUAN_BOOTSTRAP_PASSWORD 环境变量" >&2
  exit 1
fi

cd "${APP_DIR}"
tar --exclude=node_modules --exclude=dist --exclude=data --exclude=.git --exclude='*.log' -czf "${ARCHIVE}" .
scp -P "${SSH_PORT}" "${ARCHIVE}" "${VPS_USER}@${VPS_HOST}:/tmp/inductor-app.tar.gz"

ssh -p "${SSH_PORT}" "${VPS_USER}@${VPS_HOST}" \
  REMOTE_DIR="${REMOTE_DIR}" APP_PORT="${APP_PORT}" GUOXUAN_BOOTSTRAP_PASSWORD="${GUOXUAN_BOOTSTRAP_PASSWORD}" 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail
mkdir -p "${REMOTE_DIR}"
tar -xzf /tmp/inductor-app.tar.gz -C "${REMOTE_DIR}"
cd "${REMOTE_DIR}"

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
  COMPOSE_CMD="sudo -n docker-compose"
else
  echo "SERVER_MISSING_DOCKER"
  exit 20
fi

if [[ ! -f .env ]]; then
  MYSQL_PASSWORD="$(openssl rand -hex 24)"
  BOOTSTRAP_PASSWORD="$(openssl rand -hex 16)"
  cat > .env <<ENV_EOF
MYSQL_PASSWORD=${MYSQL_PASSWORD}
BOOTSTRAP_PASSWORD=${BOOTSTRAP_PASSWORD}
GUOXUAN_BOOTSTRAP_PASSWORD=${GUOXUAN_BOOTSTRAP_PASSWORD}
TZ=Asia/Shanghai
APP_PORT=${APP_PORT}
NODE_IMAGE=mirror.ccs.tencentyun.com/library/node:24-alpine
MYSQL_IMAGE=mirror.ccs.tencentyun.com/library/mysql:8.4
ENV_EOF
else
  sed -i "s/^APP_PORT=.*/APP_PORT=${APP_PORT}/" .env
  grep -q '^NODE_IMAGE=' .env || echo 'NODE_IMAGE=mirror.ccs.tencentyun.com/library/node:24-alpine' >> .env
  grep -q '^MYSQL_IMAGE=' .env || echo 'MYSQL_IMAGE=mirror.ccs.tencentyun.com/library/mysql:8.4' >> .env
fi
chmod 600 .env

${COMPOSE_CMD} -f compose.ip.yaml down --remove-orphans || true
${COMPOSE_CMD} -f compose.ip.yaml up -d --build
${COMPOSE_CMD} -f compose.ip.yaml ps
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${APP_PORT}/api/health" 2>/dev/null; then
    exit 0
  fi
  sleep 2
done
echo "APP_HEALTHCHECK_TIMEOUT" >&2
exit 1
REMOTE_SCRIPT

echo "DEPLOYED http://${VPS_HOST}:${APP_PORT}"
