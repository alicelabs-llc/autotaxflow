#!/usr/bin/env bash
# AutoTaxFlow deploy script — multi-target.
#
# Usage:
#   ./scripts/deploy.sh fly|vercel|railway|k8s|all
#
# Prerequisites (varies by target):
#   - fly:     flyctl installed, `fly auth login`, app names registered
#   - vercel:  vercel CLI installed, `vercel login`, project linked
#   - railway: railway CLI installed, `railway login`, project linked
#   - k8s:     kubectl configured against your cluster, GHCR push access
#
# Before first deploy, set up your secrets in the target platform.
# See docs/DEPLOY.md for full setup guide.

set -euo pipefail

TARGET="${1:-all}"
REGISTRY="ghcr.io/alicelabs-llc/autotaxflow"
VERSION="${VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()  { echo -e "${GREEN}✓${NC} $*"; }
warn(){ echo -e "${YELLOW}!${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }

# ---- Target: FLY ----
deploy_fly() {
  log "Deploying to Fly.io..."
  if ! command -v fly &> /dev/null; then err "flyctl not installed"; return 1; fi
  fly deploy --config deploy/fly/api.fly.toml --app autotaxflow-api
  fly deploy --config deploy/fly/worker.fly.toml --app autotaxflow-worker
  fly deploy --config deploy/fly/web.fly.toml --app autotaxflow-web
  ok "Fly.io deploy done for version ${VERSION}"
  ok "  API:    https://autotaxflow-api.fly.dev"
  ok "  Worker: running in background"
  ok "  Web:    https://autotaxflow-web.fly.dev"
}

# ---- Target: VERCEL (web only) ----
deploy_vercel() {
  log "Deploying web to Vercel..."
  if ! command -v vercel &> /dev/null; then err "vercel CLI not installed"; return 1; fi
  (cd apps/web && vercel --prod --yes)
  ok "Vercel web deploy done"
}

# ---- Target: RAILWAY ----
deploy_railway() {
  log "Deploying to Railway..."
  if ! command -v railway &> /dev/null; then err "railway CLI not installed"; return 1; fi
  railway up --service api
  railway up --service worker
  railway up --service web
  ok "Railway deploy done"
}

# ---- Target: KUBERNETES ----
deploy_k8s() {
  log "Deploying to Kubernetes..."
  if ! command -v kubectl &> /dev/null; then err "kubectl not installed"; return 1; fi
  # Build & push images to registry first
  if command -v docker &> /dev/null; then
    log "Building Docker images..."
    docker build -f apps/api/Dockerfile    -t ${REGISTRY}-api:${VERSION}    .
    docker build -f apps/worker/Dockerfile -t ${REGISTRY}-worker:${VERSION} .
    docker build -f apps/web/Dockerfile    -t ${REGISTRY}-web:${VERSION}    .
    docker push ${REGISTRY}-api:${VERSION}
    docker push ${REGISTRY}-worker:${VERSION}
    docker push ${REGISTRY}-web:${VERSION}
    ok "Images pushed to ${REGISTRY}:${VERSION}"
  else
    warn "docker not installed — skipping image build/push. Using :latest tag."
  fi
  kubectl apply -f deploy/kubernetes/manifests.yaml
  kubectl rollout restart deployment/autotaxflow-api    -n autotaxflow
  kubectl rollout restart deployment/autotaxflow-worker -n autotaxflow
  kubectl rollout restart deployment/autotaxflow-web    -n autotaxflow
  ok "Kubernetes deploy triggered for version ${VERSION}"
}

# ---- Prisma migrate (run after deploy, against the live DB) ----
migrate_db() {
  log "Running prisma db push against live DB..."
  npm run db:push
  ok "DB schema synced"
}

case "$TARGET" in
  fly)     deploy_fly ;;
  vercel)  deploy_vercel ;;
  railway) deploy_railway ;;
  k8s)     deploy_k8s ;;
  all)
    deploy_fly
    deploy_vercel
    migrate_db
    ;;
  *)
    err "Unknown target: $TARGET"
    echo "Usage: $0 {fly|vercel|railway|k8s|all}"
    exit 1
    ;;
esac

ok "Deploy script finished."
