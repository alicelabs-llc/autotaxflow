#!/usr/bin/env bash
# AutoTaxFlow — Hostinger VPS deploy script
# Run on the VPS as the autotaxflow user.
#
# What it does:
#   1. git pull the latest from main
#   2. docker compose build (only if image tags changed)
#   3. docker compose up -d (restarts containers)
#   4. prisma db push (inside api container — applies any schema changes)
#   5. nginx reload (picks up any new config)
#   6. health check
#
# Usage:
#   ./scripts/deploy-hostinger.sh [--no-build] [--no-pull]
#
# Exit codes:
#   0  — success
#   1  — env not configured (.env missing)
#   2  — git pull failed
#   3  — docker build failed
#   4  — containers didn't start
#   5  — db push failed
#   6  — health check failed

set -euo pipefail

REPO_DIR="/opt/autotaxflow"
COMPOSE_FILE="${REPO_DIR}/docker-compose.hostinger.yml"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

NO_BUILD=0
NO_PULL=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-build) NO_BUILD=1; shift ;;
    --no-pull)  NO_PULL=1;  shift ;;
    *) err "Unknown arg: $1"; exit 99 ;;
  esac
done

cd "${REPO_DIR}" || { err "Repo dir ${REPO_DIR} not found"; exit 1; }

# 1. Verifica .env
if [[ ! -f .env ]]; then
  err ".env not found. Run: cp .env.example .env && nano .env"
  exit 1
fi
ok ".env present"

# 2. git pull
if [[ ${NO_PULL} -eq 0 ]]; then
  log "Pulling latest from git..."
  if ! git pull --ff-only origin main 2>&1; then
    err "git pull failed — check for local changes"
    exit 2
  fi
  ok "git pull done"
fi

# 3. docker compose build
if [[ ${NO_BUILD} -eq 0 ]]; then
  log "Building images..."
  if ! docker compose -f "${COMPOSE_FILE}" build; then
    err "docker compose build failed"
    exit 3
  fi
  ok "images built"
fi

# 4. docker compose up -d
log "Starting containers..."
if ! docker compose -f "${COMPOSE_FILE}" up -d; then
  err "docker compose up failed"
  exit 4
fi
ok "containers up"

# 5. Espera a que postgres esté healthy
log "Waiting for postgres to be healthy..."
for i in {1..30}; do
  if docker compose -f "${COMPOSE_FILE}" ps postgres | grep -q "healthy"; then
    ok "postgres healthy"
    break
  fi
  sleep 2
  [[ $i -eq 30 ]] && { err "postgres not healthy after 60s"; exit 4; }
done

# 6. prisma db push
log "Applying Prisma schema..."
if ! docker compose -f "${COMPOSE_FILE}" exec -T api \
  npx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss 2>&1; then
  err "prisma db push failed"
  exit 5
fi
ok "DB schema applied"

# 7. nginx reload (por si cambiaron configs)
if [[ -f /etc/nginx/sites-enabled/atf.alicelabs.site.conf ]]; then
  log "Reloading nginx..."
  if ! sudo nginx -t 2>&1; then
    warn "nginx config test failed — skipping reload"
  else
    sudo systemctl reload nginx
    ok "nginx reloaded"
  fi
fi

# 8. Health check
log "Health check..."
sleep 3
API_URL="${NEXT_PUBLIC_API_URL:-https://api.atf.alicelabs.site}"
WEB_URL="${WEB_ORIGIN:-https://atf.alicelabs.site}"

if command -v curl &>/dev/null; then
  api_res=$(curl -fsS --max-time 5 "${API_URL}/health" 2>/dev/null || echo "FAIL")
  web_res=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 5 "${WEB_URL}/deploy-status" 2>/dev/null || echo "FAIL")

  if [[ "${api_res}" == "FAIL" ]]; then
    err "API health check failed: ${API_URL}/health did not respond OK"
    exit 6
  fi
  if [[ "${web_res}" != "200" ]]; then
    err "Web health check failed: ${WEB_URL}/deploy-status returned ${web_res}"
    exit 6
  fi
  ok "API health: ${api_res}"
  ok "Web status: HTTP ${web_res}"
fi

ok "Deploy complete!"
echo ""
echo "Stack status:"
docker compose -f "${COMPOSE_FILE}" ps
echo ""
echo "URLs:"
echo "  Web: ${WEB_URL}"
echo "  Web status page: ${WEB_URL}/deploy-status"
echo "  API: ${API_URL}/health"
