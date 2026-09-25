#!/usr/bin/env bash
# AutoTaxFlow — Free tier deploy script
#
# Orchestrates deploy a: Vercel (web) + Render (api + worker).
# Pre-supone: ya creaste cuentas en Supabase y Upstash y anotaste DATABASE_URL
# + REDIS_HOST/PORT/PASSWORD. Los secrets los seteas via dashboard de Render
# (este script no puede setear secrets por seguridad).
#
# Usage:
#   ./scripts/deploy-free.sh init | web | api | worker | all | status

set -euo pipefail

API_SERVICE="autotaxflow-api"
WORKER_SERVICE="autotaxflow-worker"
WEB_PROJECT="autotaxflow-web"

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

cmd_init() {
  log "Free tier setup checklist"
  cat <<CHECKLIST

Pasos a completar manualmente antes de deployar:

  1. Fork del repo en GitHub (https://github.com/alicelabs-llc/autotaxflow → Fork)

  2. Supabase (https://supabase.com):
     - Crear project "autotaxflow" en us-east-1, plan Free
     - Project Settings → Database → copiar connection string URI
     - Aplicar schema:  DATABASE_URL="<...>" npx prisma db push --schema packages/db/prisma/schema.prisma

  3. Upstash (https://upstash.com):
     - Crear database "autotaxflow-redis" en us-east-1
     - Copiar redis:// URL — parse host/port/password

  4. Render (https://render.com):
     - New → Blueprint → connect tu fork → usa el render.yaml del repo
     - Setear en autotaxflow-api env vars:
         DATABASE_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD,
         JWT_SECRET, TOKEN_ENC_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
         STRIPE_BILLING_WEBHOOK_SECRET, STRIPE_PRICE_STARTER/PRO/BUSINESS/CPA_PARTNER,
         SHOPIFY_API_SECRET, RESEND_API_KEY, etc (ver docs/DEPLOY_FREE.md sección 3.2)
     - Setear en autotaxflow-worker env vars: DATABASE_URL, REDIS_*, TOKEN_ENC_KEY, RESEND_API_KEY

  5. Vercel (https://vercel.com):
     - Add New → Project → import tu fork
     - Root Directory: apps/web
     - Deploy (Vercel usa apps/web/vercel.json automáticamente)

  6. Cloudflare DNS (o el DNS donde manejes alicelabs.site):
     - A record: atf → 76.76.21.21 (Vercel)
     - CNAME: www.atf → cname.vercel-dns.com

  7. UptimeRobot (https://uptimerobot.com):
     - Add Monitor → HTTP(s) → URL https://autotaxflow-api.onrender.com/health, interval 10 min

  8. Stripe Dashboard (https://dashboard.stripe.com):
     - Crear 4 Products + Prices (Starter 79, Pro 149, Business 299, CPA 49)
     - Webhooks: 2 endpoints apuntando a https://autotaxflow-api.onrender.com/api/...
     - Activar Stripe Tax

Cuando termines, corre:
  ./scripts/deploy-free.sh status   # verifica que las URLs responden
  ./scripts/deploy-free.sh all      # deploy manual (si auto-deploy está off)

CHECKLIST
}

cmd_web() {
  log "Deploying web to Vercel..."
  if ! command -v vercel &> /dev/null; then
    err "vercel CLI not installed: npm i -g vercel"
    exit 1
  fi
  (cd apps/web && vercel --prod --yes)
  ok "Web deploy done"
}

cmd_api() {
  log "Triggering manual deploy of API on Render..."
  local DEPLOY_HOOK="${RENDER_API_DEPLOY_HOOK:-}"
  if [[ -z "${DEPLOY_HOOK}" ]]; then
    warn "RENDER_API_DEPLOY_HOOK not set. Get it from Render dashboard → autotaxflow-api → Settings → Deploy Hook"
    warn "Skipping API manual deploy (auto-deploy on git push should still work)"
    return
  fi
  curl -X POST "${DEPLOY_HOOK}" -fsS
  ok "API deploy triggered"
}

cmd_worker() {
  log "Triggering manual deploy of Worker on Render..."
  local DEPLOY_HOOK="${RENDER_WORKER_DEPLOY_HOOK:-}"
  if [[ -z "${DEPLOY_HOOK}" ]]; then
    warn "RENDER_WORKER_DEPLOY_HOOK not set. Get it from Render dashboard → autotaxflow-worker → Settings → Deploy Hook"
    warn "Skipping Worker manual deploy"
    return
  fi
  curl -X POST "${DEPLOY_HOOK}" -fsS
  ok "Worker deploy triggered"
}

cmd_all() {
  cmd_api
  cmd_worker
  cmd_web
  ok "All deploys triggered"
}

cmd_status() {
  log "Health checks..."

  local API_URL="${API_URL:-https://autotaxflow-api.onrender.com}"
  local WEB_URL="${WEB_URL:-https://atf.alicelabs.site}"

  echo ""
  echo "Services:"
  echo "  API:    ${API_URL}/health"
  echo "  Web:    ${WEB_URL}"
  echo "  Status: ${WEB_URL}/deploy-status"
  echo ""

  if command -v curl &>/dev/null; then
    log "Probing API health..."
    if curl -fsS --max-time 10 "${API_URL}/health" 2>/dev/null; then
      echo ""
      ok "API OK"
    else
      err "API unreachable (may be asleep — first request after idle takes 30-60s)"
    fi

    log "Probing web deploy-status..."
    if curl -fsSI --max-time 10 "${WEB_URL}/deploy-status" 2>/dev/null | head -1; then
      ok "Web OK"
    else
      err "Web unreachable"
    fi

    log "Probing web landing..."
    if curl -fsSI --max-time 10 "${WEB_URL}/" 2>/dev/null | head -1; then
      ok "Landing OK"
    fi
  fi

  echo ""
  ok "Status check complete. Open ${WEB_URL}/deploy-status in browser for the 4-check verification table."
}

case "${1:-status}" in
  init)    cmd_init ;;
  web)     cmd_web ;;
  api)     cmd_api ;;
  worker)  cmd_worker ;;
  all)     cmd_all ;;
  status)  cmd_status ;;
  *)
    err "Unknown command: $1"
    echo "Usage: $0 {init|web|api|worker|all|status}"
    exit 1
    ;;
esac
