# Deploy 100% Free — `atf.alicelabs.site`

Stack recomendado para arrancar sin gastar un centavo:

| Servicio | Rol | Free tier | ¿Expira? |
|---|---|---|---|
| **Vercel Hobby** | Web (Next.js) | 100GB bandwidth/mes, custom domain, HTTPS auto | ❌ No expira |
| **Render Free Web Service** ×2 | API (Fastify) + Worker (BullMQ) | 750h/mes por servicio, sleep after 15min idle | ❌ No expira |
| **Supabase Free** | Postgres | 500MB DB, 5GB egress, 7-day backups | ❌ No expira (pausa tras 1 semana inactivo) |
| **Upstash Free** | Redis | 256MB, 10K cmds/day, 10GB bandwidth | ❌ No expira |
| **Cloudflare DNS** | DNS + CDN | unlimited | ❌ No expira |

**Total mensual: $0**

---

## Limitaciones del stack free

| Limitación | Impacto en AutoTaxFlow | Mitigación |
|---|---|---|
| Render API sleep after 15min | Cold start 30-60s en el primer request tras idle | OK para MVP. Stripe webhooks tienen retry automático a 1min. Para evitar sleep: cron ping cada 10min (ver sección 5) |
| 10K Upstash commands/day | BullMQ worker consume ~50 cmds/día en MVP (10 webhooks/día) | OK hasta ~200 webhooks/día. Límite alcanza ~500 clientes activos |
| 500MB Postgres (Supabase) | Cada Transaction ocupa ~2KB. Capacidad: ~250K transacciones | Suficiente hasta ~500 clientes con 6 meses de historial |
| 5GB egress/mes en Supabase | Si haces muchos reports descargando CSVs pesados | Raro exceder en MVP |
| 100GB bandwidth Vercel | Web app Next.js ~100KB por página × ~1M páginas/mes | OK hasta ~50K visitas/mes |

**Cuando conviene migrar a paid**:
- Si el API duerme y afecta UX → $7/mes Render Starter (no sleep)
- Si excedes 10K Upstash cmds/día → $0.2/100K cmds
- Si excedes 500MB Postgres → $25/mes Supabase Pro (8GB)
- Si tu web recibe >50K visitas → $20/mes Vercel Pro

Hasta 50 clientes pagando $79 (Plan Starter), el stack free te da **$4K/mes de revenue con $0 de costo de infra**.

---

## 0. Prerequisites

- [ ] **Domain `alicelabs.site`** (DNS configurable, no importa dónde lo compraste)
- [ ] **GitHub account** (para conectar Vercel y Render)
- [ ] **Stripe account** para crear Products, Prices y webhooks
- [ ] **5 min para crear cuentas** en Vercel, Render, Supabase, Upstash, Cloudflare

---

## 1. Supabase — Postgres free

### 1.1 Crear cuenta y proyecto
1. Ve a https://supabase.com → Sign up (con GitHub)
2. New Project →
   - Name: `autotaxflow`
   - Database Password: **anota esto** (ej: `MyStr0ngP@ssword!`)
   - Region: `US East (Ohio)` (más cercano a Stripe/Render)
   - Plan: Free
3. Espera 2 min a que provisione

### 1.2 Obtener connection string
1. Project Settings → Database → Connection string → **URI**
2. Se ve así: `postgresql://postgres.abc123:MyStr0ngP@ssword!@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
3. Guárdalo como `DATABASE_URL` en los pasos siguientes

### 1.3 Aplicar schema
```bash
# Local (en tu laptop, con el repo clonado)
DATABASE_URL="postgresql://postgres.abc123:MyStr0ngP@ssword!@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  npx prisma db push --schema packages/db/prisma/schema.prisma
```

Espera:
```
🚀  Your database is now in sync with your Prisma schema. Done in 1.5s
```

---

## 2. Upstash — Redis free

### 2.1 Crear cuenta y database
1. Ve a https://upstash.com → Sign up (con GitHub o Google)
2. New Database →
   - Name: `autotaxflow-redis`
   - Region: `us-east-1` (matchear con Supabase)
   - Type: Regional
3. Crea

### 2.2 Obtener credentials
1. En la database, click "REST API" / "Connect"
2. Copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (no usamos REST, usamos Redis protocol)
3. Mejor: en la pestaña "Redis Connect", copia la URL que se ve así:
   ```
   redis://default:AbCdEfGhIjKlMnOp@us1-soft-rabbit-12345.upstash.io:6379
   ```
4. Guárdalo — vamos a partir esto en `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

Parse:
```bash
REDIS_URL="redis://default:AbCdEfGhIjKlMnOp@us1-soft-rabbit-12345.upstash.io:6379"
# Host: us1-soft-rabbit-12345.upstash.io
# Port: 6379
# Password: AbCdEfGhIjKlMnOp
```

---

## 3. Render — API + Worker free

### 3.1 Crear cuenta y API service
1. Ve to https://render.com → Sign up (con GitHub)
2. New + → Web Service →
   - Connect a repo: elige tu fork de `alicelabs-llc/autotaxflow`
   - Name: `autotaxflow-api`
   - Region: `Oregon` (closest to Stripe/Upstash-us-east)
   - Branch: `main`
   - Runtime: Node
   - Build Command: `npm install && npx prisma generate --schema packages/db/prisma/schema.prisma && npx tsc -p apps/api/tsconfig.json`
   - Start Command: `node apps/api/dist/index.js`
   - Instance Type: **Free** (512MB RAM, sleep after 15min)
3. Environment variables (las veremos abajo)
4. Create Web Service

### 3.2 Environment variables para el API
En la sección "Environment" del servicio, agrega:

```ini
NODE_ENV=production
PORT=3001

DATABASE_URL=postgresql://postgres.abc123:MyStr0ngP@ssword!@aws-0-us-east-1.pooler.supabase.com:5432/postgres

REDIS_HOST=us1-soft-rabbit-12345.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=AbCdEfGhIjKlMnOp

JWT_SECRET=<genera con: openssl rand -base64 32>
TOKEN_ENC_KEY=<genera con: openssl rand -hex 32>

WEB_ORIGIN=https://atf.alicelabs.site

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BILLING_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...
STRIPE_PRICE_CPA_PARTNER=price_...

QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_ENVIRONMENT=sandbox
QBO_REDIRECT_URI=https://api.atf.alicelabs.site/api/integrations/qbo/callback

SHOPIFY_API_SECRET=
WOOCOMMERCE_API_SECRET=
BIGCOMMERCE_STORE_HASH=
BIGCOMMERCE_CLIENT_SECRET=

OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=

RESEND_API_KEY=
EMAIL_FROM=alerts@alicelabs.site
EMAIL_FROM_NAME=AutoTaxFlow Alerts
APP_BASE_URL=https://atf.alicelabs.site

SENTRY_DSN=
```

### 3.3 Crear Worker service
1. New + → Web Service → mismo repo
2. Name: `autotaxflow-worker`
3. Build Command: `npm install && npx prisma generate --schema packages/db/prisma/schema.prisma && npx tsc -p apps/worker/tsconfig.json`
4. Start Command: `node apps/worker/dist/index.js`
5. Instance Type: **Free**
6. Environment: las mismas variables que el API, EXCEPTO:
   - No necesitas `STRIPE_BILLING_WEBHOOK_SECRET`, `WOOCOMMERCE_API_SECRET`, etc (worker no recibe webhooks)
   - Sí necesitas: `DATABASE_URL`, `REDIS_*`, `TOKEN_ENC_KEY`, `QBO_ENVIRONMENT`, `RESEND_API_KEY`, `EMAIL_FROM*`, `APP_BASE_URL`

7. Create Web Service

### 3.4 URLs públicas
Anota las URLs públicas que Render te asigna (Formato: `https://autotaxflow-api.onrender.com` y `https://autotaxflow-worker.onrender.com` — esta última no se accede por HTTP pero el worker necesita estar "deployed" en Render).

---

## 4. Vercel — Web app free

### 4.1 Crear cuenta y proyecto
1. Ve a https://vercel.com → Sign up (con GitHub)
2. Add New → Project →
   - Importa tu fork de `alicelabs-llc/autotaxflow`
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `apps/web`
   - Build Command: `cd ../.. && npm install && npm run db:generate && cd apps/web && next build` (vercel.json ya configurado)
   - Output Directory: `.next` (auto)
3. Environment Variables (sección Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` = `https://autotaxflow-api.onrender.com`
   - `API_URL` = `https://autotaxflow-api.onrender.com` (para server-side fetches)
4. Deploy

Vercel te da una URL tipo `https://autotaxflow-web.vercel.app`. Probamos que la web levanta.

---

## 5. Prevenir sleep del API (cron ping)

El API Free de Render duerme tras 15 min idle. Stripe retry automáticamente a 1 min, así que no perdés webhooks — pero UX de login es afectada si un usuario intenta loggear durante sleep.

**Fix gratis**: usar UptimeRobot (https://uptimerobot.com) free tier para ping cada 10 min:

1. Crea cuenta en UptimeRobot
2. Add Monitor → HTTP(s) → URL: `https://autotaxflow-api.onrender.com/health` → interval 10 min
3. Save

El API queda siempre caliente (cuesta 0).

---

## 6. Configurar DNS `atf.alicelabs.site` → Vercel

### 6.1 Añadir custom domain en Vercel
1. Vercel → tu proyecto → Settings → Domains
2. Add → `atf.alicelabs.site`
3. Add → `www.atf.alicelabs.site` (opcional redirect)

Vercel te da los records DNS a añadir:
```
A     atf    → 76.76.21.21 (Vercel IP)
CNAME www.atf → cname.vercel-dns.com
```

### 6.2 Configurar DNS en tu proveedor
En el panel donde manejes `alicelabs.site` (Cloudflare, Namecheap, Hostinger, etc):

| Tipo | Host | Value | TTL |
|---|---|---|---|
| A | `atf` | `76.76.21.21` | 3600 |
| CNAME | `www.atf` | `cname.vercel-dns.com` | 3600 |

Espera 5-30 min. Vercel auto-emite el certificado TLS.

### 6.3 Verificación
```bash
curl -I https://atf.alicelabs.site/
# Expected: HTTP/2 200
```

---

## 7. Configurar Stripe Dashboard

### 7.1 Crear Products + Prices
- AutoTaxFlow Starter — $79/mo → copia `price_...` → `STRIPE_PRICE_STARTER` en Render API
- AutoTaxFlow Pro — $149/mo → `STRIPE_PRICE_PRO`
- AutoTaxFlow Business — $299/mo → `STRIPE_PRICE_BUSINESS`
- AutoTaxFlow CPA Partner — $49/mo → `STRIPE_PRICE_CPA_PARTNER`

### 7.2 Registrar 2 webhooks
1. https://dashboard.stripe.com/webhooks → Add endpoint
2. **Ingest webhook**:
   - URL: `https://autotaxflow-api.onrender.com/api/webhooks/stripe/`
   - Events: `charge.succeeded`, `charge.refunded`, `charge.failed`, `payout.paid`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET` en Render API
3. **Billing webhook**:
   - URL: `https://autotaxflow-api.onrender.com/api/billing/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Copy signing secret → `STRIPE_BILLING_WEBHOOK_SECRET` en Render API

### 7.3 Activar Stripe Tax
https://dashboard.stripe.com/tax → Activate. Tarifa 0.5% o $0.50/tx la cobra Stripe directo. AutoTaxFlow no agrega markup.

---

## 8. Smoke test end-to-end

```bash
# 1. API health
curl https://autotaxflow-api.onrender.com/health
# Expected: {"status":"OK","service":"autotaxflow-api","version":"0.6.0",...}

# 2. Web deploy-status
curl -I https://atf.alicelabs.site/deploy-status
# Expected: HTTP/2 200

# 3. Register user
curl -X POST https://autotaxflow-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}'

# 4. Trigger Stripe test webhook
stripe listen --forward-to https://autotaxflow-api.onrender.com/api/webhooks/stripe/
stripe trigger charge.succeeded
```

Visita https://atf.alicelabs.site/deploy-status — debes ver 4 checks verdes.

---

## 9. Operación y troubleshooting

### Logs
- **Vercel**: Dashboard → tu proyecto → Deployments → click uno → "Logs"
- **Render API**: Dashboard → autotaxflow-api → Logs (real-time, retención 7 días en Free)
- **Render Worker**: idem `autotaxflow-worker`
- **Supabase**: Dashboard → autotaxflow → Logs → Postgres logs
- **Upstash**: Dashboard → tu redis → Request Analyzer

### Update deploy (cada vez que hagas git push)
```bash
# Vercel: auto-deploy en cada push a main (si enabled)
# Render: en cada push a main (si auto-deploy enabled)
# Para deploy manual en Render:
curl -X POST https://api.render.com/deploy/srv-abc123?key=$RENDER_DEPLOY_HOOK
```

### Render Free → migración a Starter
Cuando tu API empiece a tener cold starts molestos (clientes notando delay):
1. Render dashboard → autotaxflow-api → Settings → Instance Type → Starter ($7/mes)
2. Idem para el worker
3. Resulta en $14/mes, break-even en 1 cliente Starter

### Supabase pausa inactiva
Si tu DB no tiene queries en 1 semana, Supabase pausa el proyecto Free. Fix:
- UptimeRobot ping cada 10 min a `/health` ya está hitting la DB (el API hace `prisma.user.findUnique` en cada `/me`)
- No necesitas nada extra

---

## 10. Costo total real

| Servicio | Free tier | Tráfico estimado (MVP 0-50 clientes) | ¿Excede free? |
|---|---|---|---|
| Vercel Hobby | 100GB BW | <1GB | ❌ No |
| Render Free ×2 | 750h/svc | ~750h cada uno | ❌ No (con UptimeRobot ping) |
| Supabase Free | 500MB DB | <50MB | ❌ No |
| Upstash Free | 10K cmds/day | ~100 cmds/day | ❌ No |
| Cloudflare DNS | Unlimited | trivial | ❌ No |
| **TOTAL** | | | **$0/mes** |

Break-even: cuando cobres a tu **primer cliente Starter ($79)**, todo ese revenue es profit (margen 100% sobre infra). Si cobras 1 Plan Business ($299), son 4 meses de stack free pagado por adelantado.

---

## 11. Cuando migrar a VPS Hostinger

El stack free está bien hasta ~50 clientes activos. Cuando se acerque a ese límite, o si:
- Tienes >50K visitas/mes en el web (Vercel BW limit 100GB)
- Render API duerme a pesar de ping (avg traffic alto)
- Necesitas backend worker más potente (QBO sync, reports pesados)
- Quieres control total de la infra

→ Migra a Hostinger KVM 1 VPS siguiendo `docs/DEPLOY_HOSTINGER.md`. Costo: $5-7/mes, cubre todo.

---

## TL;DR — quick start en 30 min

```bash
# 1. Fork repo en GitHub
# 2. Crea cuentas: vercel.com, render.com, supabase.com, upstash.com (con GitHub login)
# 3. Supabase: crea project "autotaxflow", anota DATABASE_URL
# 4. Upstash: crea redis "autotaxflow-redis", anota host/port/password
# 5. Genera secretos:
openssl rand -base64 32  # JWT_SECRET
openssl rand -hex 32    # TOKEN_ENC_KEY
# 6. Render: crea 2 Web Services Free (API + Worker) con el fork
#    - Pega DATABASE_URL, REDIS_*, JWT_SECRET, TOKEN_ENC_KEY en env vars
#    - Para API: WEB_ORIGIN=https://atf.alicelabs.site + todas las STRIPE_*
# 7. Vercel: importa el mismo fork, root=apps/web, NEXT_PUBLIC_API_URL=https://autotaxflow-api.onrender.com
# 8. Stripe Dashboard: crea 4 Prices, registra 2 webhooks, activa Stripe Tax
# 9. DNS: A record atf → 76.76.21.21 (Vercel) en el panel de alicelabs.site
# 10. UptimeRobot: ping cada 10 min a https://autotaxflow-api.onrender.com/health
# 11. Visita https://atf.alicelabs.site/deploy-status — 4 checks verdes
```

Costo total: **$0/mes**.
