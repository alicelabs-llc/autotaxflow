# Deploy en Hostinger VPS — `atf.alicelabs.site`

Runbook completo para deployar AutoTaxFlow en un VPS Hostinger con subdominio `atf.alicelabs.site` (web) y `api.atf.alicelabs.site` (API). El dominio principal `alicelabs.site` queda libre para otros usos.

---

## 0. Lo que necesitas antes de empezar

| Item | Detalle |
|---|---|
| Hostinger VPS | Mínimo **KVM 1** (1 vCPU, 4GB RAM, 50GB NVMe). Recomendado KVM 2 para producción. |
| Dominio `alicelabs.site` | Manejado en cualquier DNS (Hostinger, Cloudflare, Namecheap). Solo necesitas acceso a editar los A records. |
| Acceso SSH al VPS | Usuario root o sudoers con `ssh root@VPS_IP` |
| Stripe Dashboard | Para crear 4 Price IDs y 2 webhooks (ver `docs/DEPLOY.md` sección 1) |

---

## 1. Comprar y configurar el VPS Hostinger

1. Ve a https://www.hostinger.com/vps-hosting
2. Compra **KVM 1** (o KVM 2 si vas a tener 50+ clientes)
3. En el panel de Hostinger, elige **Ubuntu 22.04 LTS** como OS template
4. Espera 5-10 min a que se provisione
5. Anota la **IP pública** del VPS (ej: `82.XX.XX.XX`)
6. Anota la contraseña de root que Hostinger te envía por email
7. Cámbiala: https://hpanel.hostinger.com/vps → "Reset root password"

### 1.1. Conecta por SSH

```bash
ssh root@82.XX.XX.XX
# (escribe la nueva contraseña)
```

### 1.2. Hardening inicial del VPS

```bash
# Actualiza paquetes
apt update && apt upgrade -y

# Crea usuario no-root para deploy
adduser autotaxflow
usermod -aG sudo autotaxflow
rsync --archive --chown=autotaxflow:autotaxflow ~/.ssh /home/autotaxflow

# Permite SSH por key solo (desactiva password login)
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Sal y vuelve a entrar con el nuevo usuario:
```bash
exit
ssh autotaxflow@82.XX.XX.XX
```

---

## 2. DNS records para `atf.alicelabs.site`

En el panel DNS donde manejes `alicelabs.site`:

| Tipo | Host | Value | TTL |
|---|---|---|---|
| A | `atf` | `82.XX.XX.XX` (IP del VPS) | 3600 |
| A | `api.atf` | `82.XX.XX.XX` (IP del VPS) | 3600 |
| A | `www.atf` | `82.XX.XX.XX` (opcional, redirect a atf) | 3600 |

Espera 5-30 min a que el DNS propague. Verifica:
```bash
dig +short atf.alicelabs.site     # debe devolver 82.XX.XX.XX
dig +short api.atf.alicelabs.site # debe devolver 82.XX.XX.XX
```

---

## 3. Instalar Docker en el VPS

```bash
# Dependencias
sudo apt install -y ca-certificates curl gnupg lsb-release

# Docker's GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Agrega tu usuario al grupo docker (no más sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verifica
docker --version
docker compose version
```

---

## 4. Instalar nginx + certbot para TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 5. Bajar el repo y configurar

```bash
sudo mkdir -p /opt/autotaxflow
sudo chown $USER:$USER /opt/autotaxflow
cd /opt/autotaxflow

# Clonar el repo (ajusta el URL si es tu fork)
git clone https://github.com/alicelabs-llc/autotaxflow.git .

# Crear .env desde el template
cp .env.example .env
nano .env
```

Edita `.env` con los valores reales (ver siguiente sección).

### 5.1. Variables críticas

```ini
NODE_ENV="production"

DATABASE_URL="postgresql://atf:CHANGE_ME_STRONG@postgres:5432/autotaxflow?schema=public"
POSTGRES_USER="atf"
POSTGRES_PASSWORD="CHANGE_ME_STRONG"
POSTGRES_DB="autotaxflow"

REDIS_HOST="redis"
REDIS_PORT="6379"
REDIS_PASSWORD="CHANGE_ME_STRONG"

# Genera con: openssl rand -base64 32
JWT_SECRET="..."

# Genera con: openssl rand -hex 32
TOKEN_ENC_KEY="..."

WEB_ORIGIN="https://atf.alicelabs.site"

# Stripe (de tu Stripe Dashboard)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_BUSINESS="price_..."
STRIPE_PRICE_CPA_PARTNER="price_..."

# QBO (si vas a usarlo)
QBO_CLIENT_ID="..."
QBO_CLIENT_SECRET="..."
QBO_ENVIRONMENT="production"
QBO_REDIRECT_URI="https://api.atf.alicelabs.site/api/integrations/qbo/callback"

# Webhooks de marketplaces (opcional)
SHOPIFY_API_SECRET=""
WOOCOMMERCE_API_SECRET=""
BIGCOMMERCE_STORE_HASH=""
BIGCOMMERCE_CLIENT_SECRET=""

# SSO (opcional)
OIDC_ISSUER=""
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""

# Email
RESEND_API_KEY="re_..."
EMAIL_FROM="alerts@alicelabs.site"
EMAIL_FROM_NAME="AutoTaxFlow Alerts"
APP_BASE_URL="https://atf.alicelabs.site"

# Para el web app — endpoint público de la API
NEXT_PUBLIC_API_URL="https://api.atf.alicelabs.site"

# Sentry (opcional)
SENTRY_DSN=""
```

Protege el archivo:
```bash
chmod 600 .env
```

---

## 6. Build + arranque del stack

```bash
cd /opt/autotaxflow

# Build de las 3 imágenes (api, worker, web) — tarda ~5-10 min la primera vez
docker compose -f docker-compose.hostinger.yml up -d --build

# Verifica que los 5 containers estén up
docker compose -f docker-compose.hostinger.yml ps

# Logs en vivo (Ctrl-C para salir, no para nada)
docker compose -f docker-compose.hostinger.yml logs -f
```

Salida esperada del `ps`:
```
NAME             STATUS    PORTS
atf_postgres     Up        127.0.0.1:5432->5432/tcp
atf_redis        Up        127.0.0.1:6379->6379/tcp
atf_api          Up        127.0.0.1:3001->3001/tcp
atf_worker       Up
atf_web          Up        127.0.0.1:3000->3000/tcp
```

---

## 7. Aplicar schema a la DB

```bash
# Corre prisma db push dentro del container api
docker compose -f docker-compose.hostinger.yml exec api \
  npx prisma db push --schema packages/db/prisma/schema.prisma
```

Salida esperada:
```
🚀  Your database is now in sync with your Prisma schema. Done in 1.5s
```

---

## 8. Configurar nginx reverse proxy

```bash
# Instala los 2 sites de nginx
sudo cp /opt/autotaxflow/deploy/hostinger/nginx/atf.alicelabs.site.conf /etc/nginx/sites-available/
sudo cp /opt/autotaxflow/deploy/hostinger/nginx/api.atf.alicelabs.site.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/atf.alicelabs.site.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.atf.alicelabs.site.conf /etc/nginx/sites-enabled/

# Remueve el default site
sudo rm -f /etc/nginx/sites-enabled/default

# Verifica config
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. TLS con Let's Encrypt (Certbot)

```bash
sudo certbot --nginx -d atf.alicelabs.site -d www.atf.alicelabs.site --non-interactive --agree-tos -m hello@alicelabs.site --redirect
sudo certbot --nginx -d api.atf.alicelabs.site --non-interactive --agree-tos -m hello@alicelabs.site --redirect

# Verifica auto-renovación
sudo certbot renew --dry-run
```

Certbot modificará automáticamente los .conf de nginx para añadir los certificados y forzar HTTPS.

Reload final:
```bash
sudo systemctl reload nginx
```

---

## 10. Smoke test end-to-end

### 10.1. Verificar que las URLs responden

```bash
# API health
curl https://api.atf.alicelabs.site/health
# Expected: {"status":"OK","service":"autotaxflow-api","version":"0.5.0",...}

# Web deploy status page
curl -I https://atf.alicelabs.site/deploy-status
# Expected: HTTP/2 200

# Web landing
curl -I https://atf.alicelabs.site/
# Expected: HTTP/2 200
```

### 10.2. Verificar la página de status

Abre en el navegador: **https://atf.alicelabs.site/deploy-status**

Debes ver 4 checks verdes:
- Web container: OK
- API reachability: OK
- WEB_ORIGIN configured: `https://atf.alicelabs.site`
- NEXT_PUBLIC_API_URL configured: `https://api.atf.alicelabs.site`

### 10.3. Probar registro + login

Abre https://atf.alicelabs.site/register → crea un user → deberías caer en /dashboard.

### 10.4. Probar webhook de Stripe

```bash
# Local (en tu laptop):
stripe listen --forward-to https://api.atf.alicelabs.site/api/webhooks/stripe/

# En otra terminal:
stripe trigger charge.succeeded
```

Verifica en el VPS:
```bash
docker compose -f /opt/autotaxflow/docker-compose.hostinger.yml logs -f api worker | grep webhook
```

Debes ver el evento ingestado y el worker procesándolo.

---

## 11. Setup de Stripe Dashboard (resumen)

1. **Products**: crea 4 productos (Starter $79, Pro $149, Business $299, CPA Partner $49). Copia los `price_...` IDs a `.env`.
2. **Webhook ingest**: https://dashboard.stripe.com/webhooks → add endpoint `https://api.atf.alicelabs.site/api/webhooks/stripe/` → events `charge.*`, `payout.paid` → copia `whsec_...` a `STRIPE_WEBHOOK_SECRET`.
3. **Webhook billing**: add endpoint `https://api.atf.alicelabs.site/api/billing/webhook` → events `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` → copia `whsec_...` a `STRIPE_BILLING_WEBHOOK_SECRET`.
4. **Stripe Tax**: https://dashboard.stripe.com/tax → activate (tarifa 0.5% o $0.50/tx la cobra Stripe directo).

Después de cambiar `.env`:
```bash
cd /opt/autotaxflow
docker compose -f docker-compose.hostinger.yml up -d  # no necesita --build si solo cambiaste env
```

---

## 12. Operación diaria

### Ver estado del stack
```bash
cd /opt/autotaxflow
docker compose -f docker-compose.hostinger.yml ps
```

### Ver logs
```bash
# Todos los servicios
docker compose -f docker-compose.hostinger.yml logs -f --tail=100

# Solo API
docker compose -f docker-compose.hostinger.yml logs -f api

# Solo Worker
docker compose -f docker-compose.hostinger.yml logs -f worker
```

### Reiniciar
```bash
docker compose -f docker-compose.hostinger.yml restart api worker web
```

### Actualizar a nueva versión
```bash
cd /opt/autotaxflow
git pull
docker compose -f docker-compose.hostinger.yml up -d --build
docker compose -f docker-compose.hostinger.yml exec api npx prisma db push --schema packages/db/prisma/schema.prisma
```

O automatizado:
```bash
./scripts/deploy-hostinger.sh
```

### Backup de la DB
```bash
docker compose -f docker-compose.hostinger.yml exec postgres \
  pg_dump -U atf autotaxflow | gzip > /opt/autotaxflow/backups/autotaxflow-$(date +%Y%m%d).sql.gz

# Mover a Cloudflare R2 o S3 (fuera del VPS)
aws s3 cp /opt/autotaxflow/backups/autotaxflow-$(date +%Y%m%d).sql.gz s3://your-bucket/backups/
```

Cron diario en `crontab -e`:
```
0 3 * * * /opt/autotaxflow/scripts/backup-db.sh >> /var/log/backup.log 2>&1
```

---

## 13. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `502 Bad Gateway` en nginx | App no responde en puerto esperado | `docker compose ps` (debe estar Up) + `curl http://127.0.0.1:3001/health` desde el VPS |
| `ERR_SSL_PROTOCOL_ERROR` en el navegador | Certbot no corrió | `sudo certbot --nginx -d atf.alicelabs.site` |
| `ECONNREFUSED 127.0.0.1:6379` en logs API/Worker | Redis no levantó | `docker compose logs redis` |
| `Prisma Client initialization error` | Schema no aplicado | paso 7 del runbook |
| Stripe webhook rebotado con 400 | Firma inválida → STRIPE_WEBHOOK_SECRET incorrecta | Verifica el `whsec_...` en Stripe Dashboard |
| `ECONNREFUSED 127.0.0.1:5432` | Postgres no está up | `docker compose up -d postgres` + espera 30s |
| Web muestra "Loading…" infinito | Auth Provider no carga → `/api/auth/me` cae | Verifica `NEXT_PUBLIC_API_URL` en `.env` |
| "Unauthorized: invalid or missing token" al primer registro | JWT_SECRET está en default | `openssl rand -base64 32` → set en `.env` |

---

## 14. Costo mensual

Hostinger VPS KVM 1 (1 vCPU, 4GB RAM, 50GB NVMe) **~$5-7/mes** (precio promocional 12 meses, luego ~$10-15).

Stack completo AutoTaxFlow cabe en KVM 1 hasta ~30 clientes. Para escalar:
- 30-100 clientes → KVM 2 (2 vCPU, 8GB RAM)
- 100-500 clientes → KVM 4 (4 vCPU, 16GB RAM) + Redis dedicado
- 500+ → mover a Fly.io / Kubernetes (ver `docs/DEPLOY.md`)

Break-even en plan Starter ($79/mes): 1 cliente cubre el VPS + Resend + dominio.
