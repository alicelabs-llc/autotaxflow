# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2025-09-23

### Added — Free tier deploy ($0/mes total)
- **`docs/DEPLOY_FREE.md`** — runbook completo (11 secciones) para deployar AutoTaxFlow 100% free:
  - **Web** (Next.js) → Vercel Hobby (free forever, 100GB bandwidth, custom domain, TLS auto)
  - **API + Worker** (Fastify + BullMQ) → Render Free Web Services ×2 (750h/mes c/u, sleep after 15min idle)
  - **Postgres** → Supabase Free (500MB, 7-day backups, sin pausa hasta 1 semana inactivo)
  - **Redis** → Upstash Free (256MB, 10K cmds/day, 10GB bandwidth)
  - **DNS** → Cloudflare Free (A record atf → 76.76.21.21 Vercel)
  - **Anti-sleep** → UptimeRobot Free (ping cada 10 min a /health)
  - Total: **$0/mes**, break-even en 1 cliente Plan Starter ($79).
- **`render.yaml`** — Render Blueprint config para crear los 2 web services (api + worker) con un solo click desde el dashboard. Plan: free, region: oregon, buildCommand y startCommand configurados, envVars con `sync: false` para todos los secrets (Render no permite setear secrets via YAML, solo via dashboard).
- **`apps/web/vercel.json` actualizado** — rewrites `/api/*` → `https://autotaxflow-api.onrender.com/api/*` (Render Free URL). Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). `NEXT_PUBLIC_API_URL=https://atf.alicelabs.site`.
- **`scripts/deploy-free.sh`** — orquestador con 6 sub-comandos: `init` (checklist interactivo de setup), `web` (vercel --prod), `api` (curl RENDER_API_DEPLOY_HOOK), `worker` (curl RENDER_WORKER_DEPLOY_HOOK), `all` (api+worker+web en secuencia), `status` (curl health checks a los 3 servicios).
- **`README.md` actualizado** — tabla de 4 deploy targets con costo y runbook asociado: Free ($0) → Hostinger VPS ($5-7) → Fly.io ($30-50) → Kubernetes (varies).
- **`.env.example` actualizado** — bloque de comentarios documentando los 3 deploy targets (Free / Hostinger / Local dev) y qué valores usar para `DATABASE_URL` y `REDIS_*` en cada caso.

### Limitaciones documentadas del stack free
- Render API sleep after 15min idle → mitigar con UptimeRobot ping cada 10 min a /health.
- 10K Upstash commands/day → OK hasta ~200 webhooks/día (~500 clientes activos).
- 500MB Postgres (Supabase) → ~250K transacciones (~500 clientes con 6 meses historial).
- 5GB egress Supabase → raro exceder en MVP.
- 100GB bandwidth Vercel → OK hasta ~50K visitas/mes.
- **Cuando migrar a Hostinger**: cuando tengas >50 clientes, >50K visitas/mes, o Render API duerme a pesar del ping.

### Verification
- Type-check OK en api + worker + web.
- `vercel.json` válido (JSON parse OK).
- `scripts/deploy-free.sh status` corre correctamente (detecta "API unreachable" y "Web unreachable" como esperado antes de deployar).

## [0.6.0] - 2025-09-23

### Added — Hostinger VPS deploy at `atf.alicelabs.site`
- **New deploy-status page** at `/deploy-status` — server-rendered Next.js page that fetches API `/health` from the server side, then displays a 4-row connectivity table (Web container, API reachability, WEB_ORIGIN, NEXT_PUBLIC_API_URL). Useful for post-deploy smoke test in the browser.
- **Default URLs updated** to use `atf.alicelabs.site`:
  - `WEB_ORIGIN` default: `https://atf.alicelabs.site`
  - `APP_BASE_URL` default: `https://atf.alicelabs.site`
  - `EMAIL_FROM` default: `alerts@alicelabs.site`
  - `QBO_REDIRECT_URI` default: `https://api.atf.alicelabs.site/api/integrations/qbo/callback`
  - `.env.example` now documents `NEXT_PUBLIC_API_URL=https://api.atf.alicelabs.site`
- **Nginx reverse proxy configs** for the 2 subdomains:
  - `deploy/hostinger/nginx/atf.alicelabs.site.conf` — port 80 → redirect to 443, port 443 with TLS + security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), proxy_pass to `127.0.0.1:3000`, separate caching for `/_next/static/*` (1 year immutable), `/api/*` proxied to port 3001.
  - `deploy/hostinger/nginx/api.atf.alicelabs.site.conf` — same pattern, proxy_pass to `127.0.0.1:3001`, with special handling for `/api/webhooks/*` and `/api/billing/webhook` (buffering disabled for fast ack to Stripe/Shopify/WooCommerce), `/health` with no logging.
- **`docker-compose.hostinger.yml`** — single-VM compose file tuned for Hostinger KVM 1 VPS:
  - All services bind to `127.0.0.1` only (no public exposure — nginx is the only public ingress).
  - Postgres + Redis + API + Worker + Web on the same VM.
  - log rotation configured (50MB per file, 5 files max).
- **`docs/DEPLOY_HOSTINGER.md`** — full 14-section runbook:
  1. Prerequisites (VPS specs, dominio, Stripe Dashboard setup)
  2. DNS A records for `atf` and `api.atf` subdomains
  3. Docker install on Ubuntu 22.04
  4. nginx + certbot install
  5. Clone repo, set `.env` (todos los secrets documentados)
  6. Build + arranque del stack
  7. Prisma db push
  8. nginx config install
  9. TLS Let's Encrypt via certbot
  10. Smoke test end-to-end (curl + browser)
  11. Stripe Dashboard summary (Products, webhooks, Stripe Tax)
  12. Operación diaria (logs, restart, update, backup cron)
  13. Troubleshooting table (8 síntomas → causa → fix)
  14. Costo mensual (KVM 1 ~$5-7/mes, break-even en 1 cliente Starter)
- **`scripts/deploy-hostinger.sh`** — automated deploy script: `git pull` → `docker compose build` → `up -d` → wait for postgres healthy → `prisma db push` → nginx reload → health check. Exit codes 0-6 for CI integration.
- **`scripts/backup-db.sh`** — daily backup: `pg_dump` → gzip → optional S3/R2 upload → prune backups older than 14 days. Cron-ready.

### Verification
- Type-check OK on api + worker + web.
- `next build` OK: 16 pages (was 15, added `/deploy-status`).
- Smoke test: API `/health` 200, Web `/deploy-status` renders with table showing Web container OK + API reachability OK (autotaxflow-api v0.2.0 fetched from inside the Next.js server).

## [0.5.0] - 2025-09-23

### Added — E2E tests, web UI for new features, deploy configs
- **Integration tests E2E** (56 new tests, total 115):
  - `apps/api/src/integration/hmac-signatures.test.ts` (10 tests): HMAC signature helpers compatible with Stripe/Shopify/WooCommerce/BigCommerce signature formats. Verifies `stripe.webhooks.constructEvent` accepts signatures generated by our helper. Verifies timing-safe comparison on equal and unequal signatures.
  - `apps/worker/src/integration/pipeline.test.ts` (46 tests): full pipeline webhook→Transaction normalization, refund handling, aggregation math, marketplace facilitator exclusion, Nexus Engine re-open RESOLVED logic, QBO OAuth callback shape, OIDC SSO provider detection + JWT redirect hash, tier limits enforcement, VAT rate lookup fallback for 27 EU + 8 non-EU countries, US state taxability matrix (45 + DC + 5 no-tax), marketplace facilitator enum exhaustive cases, state registration pipeline valid transitions.

- **Web app UI** (4 new pages + 2 components updated):
  - `/tax` — Tax Calculator: customer address + variable line items form, calls `/api/orgs/:orgId/tax/calculate` (Stripe Tax wrapper), shows result with breakdown per jurisdiction.
  - `/registrations` — State Registrations CRUD: status badges color-coded, dropdown to change status, filing frequency + next due date tracking.
  - `/exemptions` — Exemption Certificates CRUD: 6 types (resale, manufacturing, non-profit, government, agricultural, other), 4 statuses, Approve/Reject buttons for pending certs.
  - `/vat` — VAT/GST Cross-Border CRUD: 7 regimes (EU_OSS, EU_IOSS, UK_VAT, AU_GST, NZ_GST, CA_GST_HST, COUNTRY_VAT), 8 currencies.
  - `/login` updated: detects SSO config, shows "Sign in with Google/Microsoft/Okta" button when enabled, handles `#sso_token=...` redirect callback.
  - `/transactions` updated: new "Marketplace" column with dropdown (NONE/AMAZON/ETSY/EBAY/WALMART/SHOPIFY_MARKETPLACE/CUSTOM), checkbox "Hide facilitator-collected", info banner.
  - NavBar updated: now 9 nav items (Dashboard, Transactions, Nexus Flags, Tax Calc, State Regs, Exemptions, VAT/GST, Reports, CPA Portal).

- **Deploy configs**:
  - `deploy/fly/api.fly.toml` — Fly.io API config (healthcheck, auto_stop_machines=false, 256MB).
  - `deploy/fly/worker.fly.toml` — Fly.io Worker config (long-running process, auto_stop=false).
  - `deploy/fly/web.fly.toml` — Fly.io Web config (auto_stop=true for scale-to-zero).
  - `apps/web/vercel.json` — Vercel web config with rewrites to API Fly domain + security headers (HSTS, X-Frame-Options, etc).
  - `railway.json` — Full Railway stack (3 services + 2 databases).
  - `deploy/kubernetes/manifests.yaml` — Kubernetes manifests: Namespace + 3 Deployments + 2 StatefulSets (postgres, redis) + 5 Services + 2 Ingress (TLS via cert-manager).
  - `scripts/deploy.sh` — Multi-target deploy script (`fly|vercel|railway|k8s|all`), auto-detects Docker for image builds.
  - `docs/DEPLOY.md` — Full runbook: Prerequisites checklist, Stripe Dashboard setup (Products, Prices, 2 webhooks, Stripe Tax activation, Connect setup), Fly.io step-by-step, Vercel, Railway, Kubernetes (with cert-manager), Post-deploy verification, Stripe CLI local testing, MVP ($9-16/mo) and Scale ($140-160/mo) cost estimation.

### Verification
- Type-check OK on all 4 packages + web tsc.
- 115 tests pass (13 shared + 29 api + 73 worker).
- `next build` OK: 15 pages (was 11).
- API smoke test of all new routes: `/health` 200, `/api/auth/sso/config` `{enabled:false}`, `/api/webhooks/woocommerce` 400 "Missing WooCommerce webhook headers", `/api/webhooks/bigcommerce` 400 "Missing BigCommerce webhook headers", `/api/integrations/qbo/connect` 401 without token, `/api/taxability` 401 without token, `/api/cpa/summary` 401 without token.

## [0.4.0] - 2025-09-23

### Added — Push to beat all competitors
- **Tax Calculation at Checkout** (Stripe Tax integration): `POST /api/orgs/:orgId/tax/calculate` wraps Stripe Tax API to compute sales tax in real-time. Maps our `ProductType` enum → Stripe Tax codes (SaaS_SUBSCRIPTION → `txcd_90040001`, DIGITAL_GOOD → `txcd_40000003`, etc). Uses the Stripe Connect account on behalf of the org. Plus `POST /api/orgs/:orgId/tax/create-transaction` to persist the calculation as a Tax Transaction. **Closes the #1 strategic gap from competitive analysis** — moves us into the "con cálculo" quadrant.
- **QBO sync real**: full OAuth flow (`GET /api/integrations/qbo/connect` redirect to Intuit, `GET /api/integrations/qbo/callback` token exchange + encrypted persistence, `POST /api/integrations/qbo/disconnect`). Worker jobs `sync.qbo.accounts` (Chart of Accounts) and `sync.qbo.transactions` (60 days of SalesReceipts). AES-256-GCM decryption on worker side using same `TOKEN_ENC_KEY`.
- **WooCommerce connector**: `POST /api/webhooks/woocommerce` with HMAC-SHA256 verification (`x-wc-webhook-signature`, base64). Tenant lookup via `x-wc-webhook-source` shop URL. Adds `WOOCOMMERCE` to `ProviderName` enum.
- **BigCommerce connector**: `POST /api/webhooks/bigcommerce` with HMAC-SHA256 verification (`x-bc-hash-sha256`, hex). Tenant lookup via `x-bc-store-hash`. Adds `BIGCOMMERCE` to `ProviderName` enum. Timing-safe HMAC comparison.
- **SSO/OIDC**: generic OIDC plugin via `GET /api/auth/sso/login` + `GET /api/auth/sso/callback` + `GET /api/auth/sso/config`. Auto-detects provider (Google/Microsoft/Okta/generic) for UI branding. State cookie + nonce for CSRF protection. New `@fastify/cookie` dependency. Configurable via `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` env vars.
- **Exemption Certificates**: full CRUD at `/api/orgs/:orgId/exemptions`. Schema: `ExemptionCertificate` (customer info, certificateNumber, exemptionType enum, status enum PENDING_REVIEW/VALID/EXPIRED/REJECTED, fileUrl, reviewedByUserId). Supports resale, manufacturing, non-profit, government, agricultural exemptions.
- **State Registration tracking**: full CRUD at `/api/orgs/:orgId/registrations`. Schema: `StateRegistration` (state, status enum NOT_REGISTERED→REGISTERING→REGISTERED→PERMIT_PENDING→ACTIVE_FILING→VOLUNTARY_CLOSED/REVOKED, stateTaxId, filingFrequency, nextFilingDue). Tracks the post-nexus-trigger process of registering with state DORs.
- **Marketplace Facilitator logic**: extended `Transaction` with `marketplaceFacilitator` enum (NONE/AMAZON/ETSY/EBAY/WALMART/SHOPIFY_MARKETPLACE/CUSTOM) and `isFacilitatorCollected` boolean. The aggregation job now excludes transactions where `isFacilitatorCollected=true` — they don't count for the seller's nexus (the marketplace collects and remits on the seller's behalf).
- **VAT/GST global**: `VatRegistration` model + `VatRegimeType` enum (EU_OSS, EU_IOSS, UK_VAT, AU_GST, NZ_GST, CA_GST_HST, COUNTRY_VAT) for cross-border tracking. `VatRate` model with country × productType taxability. Endpoints `/api/orgs/:orgId/vat/rates`, `/api/orgs/:orgId/vat/rates/:country`, `/api/orgs/:orgId/vat/registrations` (CRUD). Seed fallback for ~35 countries (EU + UK + AU + NZ + CA + JP + KR + SG + IN + BR + MX) with standard VAT rates from OECD Tax Database 2025.
- **Production readiness**: 3 multi-stage Dockerfiles (`apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/web/Dockerfile`) with health check on the API. New `docker-compose.production.yml` that builds all 3 app images + Postgres + Redis, wired up end-to-end with all env vars mapped.

### Schema changes (breaking — requires `npm run db:push`)
- `Organization.vatRegistrations` relation.
- `Transaction.marketplaceFacilitator` (default NONE).
- `Transaction.isFacilitatorCollected` (default false).
- `ExemptionCertificate` model + `ExemptionType`, `ExemptionStatus` enums.
- `StateRegistration` model + `RegistrationStatus` enum.
- `VatRegistration` model + `VatRegimeType` enum.
- `VatRate` model.
- `ProviderName.WOOCOMMERCE` and `ProviderName.BIGCOMMERCE` added.
- `@@index([organizationId, marketplaceFacilitator])` for fast nexus-filter queries.

### Tests
- 59 tests still pass (no new tests added in this pass — most new features are integration glue that would need real Stripe/Intuit/WooCommerce test credentials).
- Type-check OK on all 4 packages.
- `next build` OK with 11 pages.
- API smoke test verifies: `/health` 200, `/api/auth/sso/config` returns `{enabled:false}` (correct when OIDC not configured), `/api/integrations/qbo/connect` 401 without token (auth middleware works), `/api/webhooks/woocommerce` 400 "Missing WooCommerce webhook headers", `/api/webhooks/bigcommerce` 400 "Missing BigCommerce webhook headers", `/api/orgs/:orgId/tax/calculate` (GET) → 404 (correct, POST-only).

### Docker
- `docker build -f apps/api/Dockerfile -t autotaxflow/api .`
- `docker build -f apps/worker/Dockerfile -t autotaxflow/worker .`
- `docker build -f apps/web/Dockerfile -t autotaxflow/web .`
- Or `docker compose -f docker-compose.production.yml up -d` to boot everything.

## [0.3.0] - 2025-09-23

### Added — Roadmap 30 días (post competitive analysis)
- **Nexus Engine**: job periódico BullMQ (`rules.evaluateAllOrgs`, cron hourly) que evalúa los `Ruleset` activos de cada org contra `StateRevenueMonthly` YTD y hace upsert de `NexusFlag`. Defaults Wayfair implícitos ($100K revenue OR 200 tx) si la org no tiene reglas custom. Reabre flags RESOLVED si el threshold se vuelve a cruzar.
- **Email alerts**: integración Resend (lazy-loaded) para notificar a OWNER/ADMIN cuando se crean nuevos `NexusFlag`. Persiste `EmailLog` para auditoría. Fallback a stdout en dev mode si `RESEND_API_KEY` no está seteada.
- **Free tier + billing**: `Tier` enum (FREE/STARTER/PRO/BUSINESS/CPA_PARTNER), `Subscription` model con `SubscriptionStatus` enum, `TIER_LIMITS` matrix (11 features × 5 tiers), `TIER_STRIPE_PRICE_ID` mapping. Endpoints `/api/billing/subscribe` (Stripe Checkout), `/api/billing/portal/:orgId` (Customer Portal), `/api/billing/webhook` (sync `customer.subscription.*` events).
- **Product taxability matrix**: `ProductTaxability` model + `ProductType` enum (5 tipos). Endpoints `/api/taxability`, `/api/taxability/:state`, `/api/taxability/:state/:productType`. Seed fallback con 250 rows (50 estados × 5 product types) usando rates reales de Tax Foundation 2025. Distingue SaaS_SUBSCRIPTION taxable en ~30 estados, DIGITAL_GOOD en ~36, PHYSICAL_GOOD en 45+DC, SERVICE en ~15.
- **CPA portal real**: ruta `/cpa` con dashboard multi-org para rol `CPA_READONLY`. Endpoint `/api/cpa/summary` que devuelve array de client orgs con YTD revenue, open/resolved flag counts, states covered. Filtro: `canAccessCpaPortal(role, tier)` — CPA_READONLY siempre; OWNER/ADMIN solo en BUSINESS.
- **Landing page**: hero ("Avalara for the rest of us"), stats bar, 6 features grid, 4-tiers pricing, integrations grid (Stripe ✅, Shopify ✅, QBO 🚧, otros 📅), CTA, footer. Authed users redirect a `/dashboard`.
- **Shopify connector**: webhook handler con HMAC-SHA256 verification (`apps/api/src/routes/webhooks/shopify.ts`), ingest job worker (`apps/worker/src/jobs/shopify-ingest.ts`). Soporta `orders/create`, `orders/paid`, `orders/updated`, `refunds/create`. Extracción de state/country en cascada: billing → shipping → customer.default_address. NaN-safe en refund amount sum (parseFloat con Number.isFinite guard).

### Schema changes (breaking — requires `npm run db:push`)
- `Organization.tier` field added (default: FREE).
- `Subscription` model + `SubscriptionStatus` enum.
- `EmailLog` model.
- `ProductTaxability` model + `ProductType` enum.
- `ProviderName.SHOPIFY` added to enum.

### Tests
- 59 tests total (vs 28 in 0.2.0). 31 new tests covering:
  - `tier-limits.test.ts` (12 tests): tier matrix, canAccessCpaPortal, TIER_STRIPE_PRICE_ID.
  - `nexus-engine.test.ts` (9 tests): pure logic of evaluateRulesForState.
  - `shopify-ingest.test.ts` (10 tests): state/country extraction fallback, refund amount math with NaN guard.

### Verification
- Type-check OK on all 4 packages (shared, db, api, worker).
- `next build` OK: 11 pages (landing + login + register + dashboard + transactions + nexus + reports + cpa + not-found).
- API smoke test: `/health` 200, `/api/taxability` sin token → 401, `/api/billing/subscribe` sin tier → 400, `/api/cpa/summary` sin token → 401, `/api/webhooks/shopify` sin headers → 400.

## [0.2.0] - 2025-09-23

### Added
- Valid Prisma schema (`packages/db/prisma/schema.prisma`) with multi-tenant isolation, idempotency unique constraints on `WebhookEvent` and `Transaction`, `Decimal` money columns, and enums for `WebhookStatus`, `ReportStatus`, `ReportType`.
- Valid shared Zod schemas (`packages/shared/schemas.ts`) covering auth, orgs, transactions, revenue-by-state, rules, flags, reports, and BullMQ job payloads.
- `turbo.json` with proper pipeline definitions and `globalEnv` allow-list.
- Pinned dependencies (no more `"latest"`) across all `package.json` files for reproducible installs.
- Real JWT auth (`@fastify/jwt`) replacing the spoofable `x-user-id` header.
- `verifyOrganizationAccess` registered as `preHandler` on `/api/orgs/:orgId/*` routes.
- `requireRole` fixed: short-circuits with `return reply` on 403.
- Env validation with Zod at startup; fail-fast on missing secrets.
- Stripe webhook now persists `WebhookEvent` **before** enqueuing; job carries only `webhookId` (no payload in queue).
- AES-256-GCM encryption for `OAuthToken` (QuickBooks access/refresh tokens).
- Graceful shutdown (SIGTERM/SIGINT handlers) for both API and Worker.
- Redis `error` + `close` listeners to prevent silent crashes.
- `aggregate_queue` and worker `aggregate.revenueDaily` job that upserts `StateRevenueDaily` + `StateRevenueMonthly` atomically.
- `handleChargeRefunded` implemented: creates a `REFUND` transaction (negative amount) and re-aggregates.
- Fixed `handleChargeSucceeded` tenant lookup: correctly uses `charge.on_behalf_of` (Connect account) and falls back to webhook header `stripe-account` for platform accounts — no longer confuses with `charge.customer`.
- Idempotency at the `Transaction` level via `@@unique([organizationId, sourceProvider, sourceId])` — reprocessing a webhook no longer duplicates rows.
- Next.js 14 web app under `apps/web/` with login page, dashboard, revenue-by-state table, and nexus flags list.
- Vitest test suite covering: webhook signature verification, idempotency on `Transaction`, daily aggregation upsert, state-revenue aggregation math.
- ESLint + Prettier config across the monorepo.
- `SECURITY.md` updated with supported version policy and disclosure scope.
- `CONTRIBUTING.md` expanded with branching, commit, and review guidelines.
- README rewritten as UTF-8 with full setup, architecture, and security model documentation.

### Changed
- `WebhookEvent.status` is now `enum WebhookStatus` instead of free-form `String`.
- `amount` columns on `Transaction`, `Payout`, `Expense` are now `Decimal @db.Decimal(12, 2)` (was `Float`).
- `grossRevenue` / `netRevenue` on `StateRevenueDaily` / `StateRevenueMonthly` are now `Decimal @db.Decimal(14, 2)`.
- `Report.status` and `Report.type` are now proper enums.
- CORS now reads `WEB_ORIGIN` env var; default is `http://localhost:3000`.
- `.env.example`: renamed `SESSION_SECRET` → `JWT_SECRET`, added `TOKEN_ENC_KEY` and `WEB_ORIGIN`.

### Fixed
- `schema.prisma` no longer wrapped in markdown — `npx prisma generate` now succeeds.
- `packages/shared/schemas.ts` no longer wrapped in markdown — TypeScript imports now resolve.
- `turbo.json` present — `npm run dev/build/lint` now work.
- `requireRole` no longer bypassed after sending 403 — added `return reply`.
- Stripe webhook raw body handling — switched to `addContentTypeParser` for `application/json` raw buffer.
- Stripe API version no longer cast to `any` — uses SDK default.
- `aggregate_queue` and `rules_queue` actually declared in `lib/bullmq.ts`.
- Worker concurrency and backoff values now match `docs/JOBS_ARCHITECTURE.md`.
- LICENSE year corrected (2026 → 2025).

### Removed
- Trivially spoofable `x-user-id` header fallback (`DEFAULT_USER_ID_FOR_DEV`).
- `origin: true` CORS allow-all.
- `apiVersion: "..." as any` cast.
- Inline `as any` casts on Stripe payload types where a typed alternative exists.

## [0.1.0] - 2025-09-01

### Added
- Initial scaffold of the AutoTaxFlow monorepo.
- Fastify API gateway with Stripe webhook route.
- BullMQ worker skeleton for Stripe ingest.
- Prisma schema (markdown-wrapped — fixed in 0.2.0).
- Architecture & business docs in `docs/`.
