# AutoTaxFlow — Deploy Guide

Production deploy runbook. Covers: Fly.io (recommended for MVP), Vercel (web only), Railway (alternative), Kubernetes (enterprise).

---

## 0. Prerequisites checklist

Before the first deploy, complete this checklist:

- [ ] **Stripe account (production or test mode)** with:
  - [ ] A connected account on behalf of which you'll calculate tax (Stripe Tax requires Connect for our flow)
  - [ ] 4 Price IDs created (one per tier — see `STRIPE_PRICE_*` env vars)
  - [ ] 2 webhooks registered: one for ingest (`charge.*`), one for billing (`customer.subscription.*`)
- [ ] **Domain + DNS** (e.g. `app.autotaxflow.dev`, `api.autotaxflow.dev`) pointing to your target
- [ ] **TLS certificates** — let your platform handle this (Fly/Vercel auto-issue LE)
- [ ] **Resend API key** for transactional emails (or skip → emails go to stdout in dev)
- [ ] **Intuit Developer account** if you want QBO sync (sandbox for dev, production approval for prod)
- [ ] **OIDC provider config** if you want SSO (Google Workspace, Microsoft Entra, Okta)
- [ ] **Shopify Partners** app if you want Shopify connector (creates `SHOPIFY_API_SECRET`)
- [ ] **AES-256 key** generated for `TOKEN_ENC_KEY`: `openssl rand -hex 32`
- [ ] **JWT secret** generated: `openssl rand -base64 32` (min 32 chars)

---

## 1. Stripe Dashboard setup

### 1.1 Create Products & Prices

Go to https://dashboard.stripe.com/products → "Add product"

| Product name | Pricing | Recurring | Price ID env var |
|---|---|---|---|
| AutoTaxFlow Starter | $79 USD/month | Monthly | `STRIPE_PRICE_STARTER` |
| AutoTaxFlow Pro | $149 USD/month | Monthly | `STRIPE_PRICE_PRO` |
| AutoTaxFlow Business | $299 USD/month | Monthly | `STRIPE_PRICE_BUSINESS` |
| AutoTaxFlow CPA Partner | $49 USD/month | Monthly | `STRIPE_PRICE_CPA_PARTNER` |

After creating each, copy the `price_...` ID.

### 1.2 Register webhooks

Go to https://dashboard.stripe.com/webhooks → "Add endpoint"

**Endpoint 1 — Ingest webhooks** (charge events):
- URL: `https://api.autotaxflow.dev/api/webhooks/stripe/`
- Events: `charge.succeeded`, `charge.refunded`, `charge.failed`, `payout.paid`
- Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

**Endpoint 2 — Billing webhooks** (subscription events):
- URL: `https://api.autotaxflow.dev/api/billing/webhook`
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Copy the signing secret → `STRIPE_BILLING_WEBHOOK_SECRET`

### 1.3 Enable Stripe Tax

Go to https://dashboard.stripe.com/tax → "Activate" — this lets us call `stripe.tax.calculations.create`. You'll be billed $0.50/transaction (or 0.5% for no-code) directly by Stripe. AutoTaxFlow doesn't add any markup.

### 1.4 Stripe Connect (for on-behalf-of tax calc)

If you're a SaaS platform billing your own customers through Connect, you'll need an Express or Custom Connect account type. Our tax calc endpoint uses `stripeAccount: connected.externalAccountId` to do tax calculations on behalf of the connected account.

---

## 2. Fly.io deploy (recommended MVP target)

### 2.1 Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2.2 Create 5 apps

```bash
fly apps create autotaxflow-api
fly apps create autotaxflow-worker
fly apps create autotaxflow-web
fly apps create autotaxflow-db        # Postgres
fly apps create autotaxflow-redis     # Redis
```

### 2.3 Provision Postgres + Redis

```bash
fly postgres create --name autotaxflow-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10
fly redis create autotaxflow-redis --region iad
```

### 2.4 Attach databases to apps

```bash
fly postgres attach autotaxflow-db --app autotaxflow-api
fly postgres attach autotaxflow-db --app autotaxflow-worker
fly redis attach autotaxflow-redis --app autotaxflow-api
fly redis attach autotaxflow-redis --app autotaxflow-worker
```

### 2.5 Set secrets

```bash
# Common secrets (run for both api and worker)
fly secrets set -a autotaxflow-api \
  JWT_SECRET=$(openssl rand -base64 32) \
  TOKEN_ENC_KEY=$(openssl rand -hex 32) \
  DATABASE_URL=postgresql://... \
  REDIS_HOST=... \
  REDIS_PORT=6379 \
  REDIS_PASSWORD=... \
  WEB_ORIGIN=https://app.autotaxflow.dev \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_BILLING_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_STARTER=price_... \
  STRIPE_PRICE_PRO=price_... \
  STRIPE_PRICE_BUSINESS=price_... \
  STRIPE_PRICE_CPA_PARTNER=price_... \
  SHOPIFY_API_SECRET=... \
  RESEND_API_KEY=... \
  EMAIL_FROM=alerts@autotaxflow.dev \
  EMAIL_FROM_NAME="AutoTaxFlow Alerts" \
  APP_BASE_URL=https://app.autotaxflow.dev \
  SENTRY_DSN=...

fly secrets set -a autotaxflow-worker \
  JWT_SECRET=$(same as api) \
  TOKEN_ENC_KEY=$(same as api) \
  DATABASE_URL=$(same as api) \
  REDIS_HOST=$(same as api) \
  REDIS_PORT=6379 \
  REDIS_PASSWORD=$(same as api) \
  QBO_ENVIRONMENT=production \
  RESEND_API_KEY=... \
  EMAIL_FROM=alerts@autotaxflow.dev \
  EMAIL_FROM_NAME="AutoTaxFlow Alerts" \
  APP_BASE_URL=https://app.autotaxflow.dev
```

### 2.6 Deploy

```bash
./scripts/deploy.sh fly
```

Or individually:
```bash
fly deploy --config deploy/fly/api.fly.toml --app autotaxflow-api
fly deploy --config deploy/fly/worker.fly.toml --app autotaxflow-worker
fly deploy --config deploy/fly/web.fly.toml --app autotaxflow-web
```

### 2.7 Run DB migration

After the first deploy, run the Prisma schema push against the live DB:

```bash
# From your local machine (must have DATABASE_URL set)
DATABASE_URL=postgresql://... npm run db:push
```

Or use the Fly console:
```bash
fly ssh console --app autotaxflow-api
cd /app
npx prisma db push --schema packages/db/prisma/schema.prisma
```

### 2.8 Map custom domains

```bash
fly certs create app.autotaxflow.dev  --app autotaxflow-web
fly certs create api.autotaxflow.dev   --app autotaxflow-api
```

Add the CNAME records to your DNS as Fly instructs, wait for issuance.

---

## 3. Vercel deploy (web only)

Use Vercel for the web app + keep API/Worker on Fly.io (or another container platform).

```bash
cd apps/web
vercel link          # link to your Vercel project
vercel env add NEXT_PUBLIC_API_URL  # https://api.autotaxflow.dev
vercel --prod
```

The `vercel.json` is already configured with rewrites that proxy `/api/*` to your Fly API, plus security headers.

---

## 4. Railway deploy

```bash
railway login
railway link
railway run ./scripts/deploy.sh railway
```

The `railway.json` defines the full stack (api + worker + web + postgres + redis). Railway handles networking between services automatically.

---

## 5. Kubernetes deploy (enterprise)

### 5.1 Build & push images

```bash
# From repo root
docker build -f apps/api/Dockerfile    -t ghcr.io/alicelabs-llc/autotaxflow-api:latest    .
docker build -f apps/worker/Dockerfile -t ghcr.io/alicelabs-llc/autotaxflow-worker:latest .
docker build -f apps/web/Dockerfile    -t ghcr.io/alicelabs-llc/autotaxflow-web:latest    .
docker push ghcr.io/alicelabs-llc/autotaxflow-api:latest
docker push ghcr.io/alicelabs-llc/autotaxflow-worker:latest
docker push ghcr.io/alicelabs-llc/autotaxflow-web:latest
```

### 5.2 Create namespace + secrets

```bash
kubectl create namespace autotaxflow
kubectl create secret generic autotaxflow-secrets --namespace autotaxflow \
  --from-literal=database-url=postgresql://... \
  --from-literal=redis-password=... \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=token-enc-key=$(openssl rand -hex 32) \
  --from-literal=postgres-password=...
```

### 5.3 Apply manifests

```bash
kubectl apply -f deploy/kubernetes/manifests.yaml
```

### 5.4 Install cert-manager + ingress-nginx

The Ingress resources expect `cert-manager.io/cluster-issuer: letsencrypt-prod`:

```bash
helm install ingress-nginx ingress-nginx --repo https://kubernetes.github.io/ingress-nginx
helm install cert-manager cert-manager --repo https://charts.jetstack.io --namespace cert-manager --create-namespace --set installCRDs=true

kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: hello@autotaxflow.dev
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

### 5.5 Update ingress hosts

Edit `deploy/kubernetes/manifests.yaml` and replace `app.autotaxflow.dev` and `api.autotaxflow.dev` with your actual domains.

### 5.6 Run DB migration

```bash
kubectl port-forward -n autotaxflow statefulset/postgres 5432:5432
# In another terminal:
DATABASE_URL=postgresql://autotaxflow_user:PASSWORD@localhost:5432/autotaxflow npm run db:push
```

---

## 6. Post-deploy verification

After deploy completes, verify the stack is healthy:

```bash
# API health
curl https://api.autotaxflow.dev/health
# Expected: {"status":"OK","service":"autotaxflow-api","version":"0.4.0",...}

# Web landing
curl -I https://app.autotaxflow.dev/
# Expected: HTTP/2 200

# Stripe webhook delivery (Stripe Dashboard → Developers → Webhooks → click endpoint → "Send test webhook" → choose charge.succeeded)
# After sending, check your Fly logs:
fly logs --app autotaxflow-api | grep webhook
fly logs --app autotaxflow-worker | grep ingest
```

---

## 7. Stripe webhook local testing

For local development, use the Stripe CLI to forward webhooks to your local API:

```bash
brew install stripe/stripe/stripe   # macOS
# or: curl -L https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz | tar xz

stripe listen --forward-to http://localhost:3001/api/webhooks/stripe/
# Copy the printed `whsec_...` → set STRIPE_WEBHOOK_SECRET in .env

stripe trigger charge.succeeded    # simulate a charge webhook
stripe trigger charge.refunded     # simulate a refund webhook
```

Then watch the API and worker logs to confirm the pipeline ingests the event.

---

## 8. Cost estimation (monthly)

MVP (0–50 customers):
| Service | Cost |
|---|---|
| Fly.io apps (3x shared-cpu-1x) | $3–7 |
| Fly Postgres (shared-cpu-1x, 10GB) | $3–5 |
| Fly Redis (1GB) | $2–3 |
| Vercel web (Hobby) | $0 |
| Domain (Cloudflare) | $1 |
| Resend (free tier 100/day) | $0 |
| Sentry (free tier) | $0 |
| **Total MVP** | **$9–16/mo** |

Scale (50–500 customers):
| Service | Cost |
|---|---|
| Fly apps (3x 2x-cpu, 1GB) | $30–50 |
| Fly Postgres (Pro, 60GB) | $30 |
| Fly Redis (5GB) | $15 |
| Vercel web (Pro) | $20 |
| Resend (5K/month) | $20 |
| Sentry (Team) | $26 |
| **Total Scale** | **$140–160/mo** |

At Plan Business ($299) breakeven is at ~1 customer. At Plan Starter ($79) breakeven is at ~2 customers.
