# AutoTaxFlow — Análisis Competitivo

> Fecha: 2025-09-23 · Fuentes: web search (avalara.com, stripe.com, taxjar.com, quaderno.io, anrok.com, sovos.com, vertexinc.com, zamp.com, numeral.com, kintsugi.com, taxcloud.com) + análisis del código del repo.

---

## 1. Mapa competitivo

AutoTaxFlow opera en el espacio de **sales tax compliance / nexus automation** para SMBs en EE.UU. con Stripe. El mercado tiene tres tiers:

### Tier 1 — Enterprise (no compiten con nosotros directamente)
| Competidor | Modelo | Pricing | Audiencia | Por qué no compiten |
|---|---|---|---|---|
| **Avalara** | Suite completa: cálculo + filing + registros + certs | $3,750–$75,385/año (media $16,717) | Enterprise y mid-market | Demasiado caro para SMB, proceso de venta largo |
| **Vertex** | Determination engine + LLM AI | Enterprise contract | Multinationals, 12000+ jurisdicciones | Misma razón |
| **Sovos** | E-invoicing + global tax | Enterprise | Global, regulado (PEPPOL, NF-e, CFDI) | Misma razón |

### Tier 2 — Mid-market SaaS / directos
| Competidor | Modelo | Pricing | Audiencia | Solapamiento con nosotros |
|---|---|---|---|---|
| **Stripe Tax** | % de tx o $0.50/tx | 0.5% del volume / $0.50 por tx | Cualquiera en Stripe | **Directo.** Pero ellos calculan tax, nosotros solo alertamos. |
| **TaxJar** (Stripe-owned) | Subscription + per-filing | $39 (Starter, 200 órdenes) / $99+ (Pro) + $20-39/filing | SMB ecommerce | **Directo.** Hace filing, nosotros no. |
| **Anrok** | AI-native, SaaS-focused | Custom (raised $100M+) | SaaS scaling $5M+ ARR | **Directo.** Tienen remote-employee nexus tracking, nosotros no. |
| **Quaderno** | Invoicing + tax compliance | ~$49-$199/mo | Cross-border (VAT+US sales tax) | **Indirecto.** Ellos cubren VAT/GST global, no solo US. |
| **TaxCloud** | API + Streamlined Sales Tax CSP | $19/mo Starter + $39/filing | SMB con QBO | **Directo.** Son los más baratos del tier SaaS. |

### Tier 3 — Indie SaaS-focused (los competidores reales)
| Competidor | Modelo | Pricing | Audiencia | Por qué son la verdadera amenaza |
|---|---|---|---|---|
| **Zamp** | Managed service + free nexus monitoring | $199/mo entry (no publicado abiertamente) | SaaS scaling | Tier gratuito de nexus monitoring. Nos come el mercado de "solo saber dónde tengo nexus". |
| **Numeral** | API-first, billing layer | Custom (Standard tier) | SaaS con billing custom | Para SaaS que no usan Stripe Billing, sino Chargebee/Recurly. |
| **Kintsugi** | AI-native, transparent pricing | Free monitoring + $75/filing | E-commerce + SaaS | Vertex invirtió en ellos. Tier free + AI agentic. Competidor existencial. |

### AutoTaxFlow en este mapa
- **Pricing**: $79 Starter / $149 Pro / $299 Business / $49 CPA Partner.
- **Posicionamiento**: data middleware + alerts, **NO tax software** (no filing, no calculation, no advice → no IRS Circular 230 exposure).
- **Open source**: el único del mercado. Kintsugi tiene tier free pero cerrado.

---

## 2. Feature matrix — qué tiene cada uno

| Feature | AutoTaxFlow | Avalara | Stripe Tax | TaxJar | Anrok | Quaderno | Zamp | Numeral | Kintsugi |
|---|---|---|---|---|---|---|---|---|---|
| **Cálculo de tax en checkout** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Nexus monitoring** | ✅ | ✅ | ✅ (≥$10K) | ✅ | ✅ (11K+ jurisdicciones) | ✅ | ✅ (free tier) | ✅ | ✅ |
| **Filing automation** | ❌ | ✅ | ✅ (Tax Complete) | ✅ AutoFile | ✅ | ✅ | ✅ | ✅ | ✅ ($75/filing) |
| **State registration** | ❌ | ✅ ($400/state) | ✅ (Tax Complete) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Product taxability matrix** | ❌ | ✅ (600+ cats) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Customer exemption certs** | ❌ | ✅ CertCapture | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **VAT / GST global** | ❌ US-only | ✅ 100+ países | ✅ | ❌ | ✅ Global | ✅ | ❌ | ✅ | ✅ |
| **E-invoicing (PEPPOL, NF-e, CFDI)** | ❌ | ✅ via Sovos | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Stripe native ingestion** | ✅ | parcial | ✅ (nativo) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **QuickBooks Online sync** | ⚠️ schema only | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Multi-tenant** | ✅ desde el día 1 | ❌ (single-tenant) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CPA role** | ✅ `CPA_READONLY` | ✅ (upsell) | ❌ | ✅ Accountant Portal | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Custom rules engine** | ✅ Ruleset→Rule[] | ✅ | ❌ | ❌ hardcoded | ✅ | ❌ | ❌ | ❌ | ✅ AI rules |
| **Audit log de operaciones** | ✅ AuditLog | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Self-hostable / open source** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Real-time aggregation** | ✅ BullMQ | batch | batch | batch nightly | ✅ | batch | batch | batch | ✅ |
| **Decimal money columns** | ✅ Decimal(12,2) | Decimal | Decimal | Decimal | Decimal | Float | Decimal | Decimal | Decimal |
| **Webhook idempotency** | ✅ `@@unique([provider,eventId])` + jobId | ✅ | ✅ (nativo) | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| **SOC 2 / ISO 27001** | ❌ | ✅ | ✅ (Stripe) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ en proceso |
| **SSO / SCIM** | ❌ | ✅ Enterprise | ✅ | ✅ Business | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Marketplace connectors** (Shopify, WooCommerce, Amazon VCS) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Email / Slack alerts** | ❌ (en roadmap) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Mobile app** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ iOS | ❌ | ❌ | ❌ |

---

## 3. Lo que NOS FALTA (priorizado)

### 🔴 Crítico — sin esto no somos competencia real

#### 1. Job periódico del motor de reglas (Nexus Engine)
- **Hoy**: dashboard muestra heuristic hardcoded (`grossRevenue >= 100_000 || txCount >= 200`).
- **Debe ser**: un job BullMQ `rules.evaluateOrg` que corre cada noche, lee los `Ruleset` activos de cada org, los evalúa contra `StateRevenueMonthly`, y hace upsert de `NexusFlag` cuando se cruza threshold.
- **Esfuerzo**: ~2 días. Schema ya tiene todo (`Ruleset`, `Rule`, `NexusFlag`).

#### 2. QBO sync real
- **Hoy**: schema tiene `ProviderName.QUICKBOOKS`, `OAuthToken` con AES-256-GCM, `Account`. Pero **no hay** OAuth flow, ni worker job `sync.qbo`.
- **Debe ser**: endpoint `/api/orgs/:orgId/integrations/qbo/connect` → redirect a Intuit OAuth → callback → persist token → job recurrente `sync.qbo` (cada 1h) que sincronice Chart of Accounts.
- **Esfuerzo**: ~3 días (Intuit SDK es particular).

#### 3. Email alerts on nexus trigger
- **Hoy**: cuando se crea un `NexusFlag`, no se avisa a nadie.
- **Debe ser**: el worker emite un evento que dispara un email (Resend/Postmark) al `OWNER`/`ADMIN` de la org: "Tienes nuevo nexus en CA".
- **Esfuerzo**: ~1 día con Resend.

#### 4. Billing / SaaS self-charge
- **Hoy**: el repo no cobra a nadie. Para tener AutoTaxFlow de verdad como SaaS, necesitamos un endpoint `/api/billing/subscribe` que cree un Customer en Stripe + una Subscription con el tier elegido.
- **Ironía**: el `docs/ANALISIS_DE_NEGOCIO.md` ya dice que deberíamos usar Stripe Tax en nuestro propio billing (dogfooding). Lo correcto.
- **Esfuerzo**: ~2 días con Stripe Billing Portal.

#### 5. Landing page / marketing site
- **Hoy**: cero. El README está orientado a devs.
- **Competidores**: Avalara, Anrok, Kintsugi tienen sites pulidos con demos, case studies, calculadoras de ROI.
- **Debe ser**: landing en `apps/web` con hero, pricing, integrations grid, blog.
- **Esfuerzo**: ~2-3 días.

### 🟡 Importante — sin esto perdemos deals vs Kintsugi/Zamp

#### 6. Free tier / monitoring-only plan
- **Hoy**: pricing empieza en $79/mes. Kintsugi y Zamp tienen **free tier de nexus monitoring** — es su gancho de adquisición.
- **Debe ser**: tier "Free Monitoring" — solo alertas de nexus, sin reports, sin QBO, sin CPA. Conversion rate subiría 3-5x.
- **Esfuerzo**: ~1 día de producto + ajustes en billing.

#### 7. Marketplace connectors (mínimo Shopify + WooCommerce)
- **Hoy**: solo Stripe.
- **TaxJar / Quaderno / Kintsugi** tienen Shopify + WooCommerce + BigCommerce + Amazon VCS.
- **Debe ser**: conector de Shopify (webhook orders/create → normalizamos a `Transaction`).
- **Esfuerzo**: ~3-4 días por conector.

#### 8. CPA-facing portal (real, no solo rol)
- **Hoy**: tenemos `Role.CPA_READONLY` pero no hay UI distinta para CPAs.
- **Debe ser**: `/cpa` route con vista multi-client (un CPA ve todas las orgs donde es miembro en un dashboard consolidado).
- **Esfuerzo**: ~2 días.

#### 9. Product taxability básico
- **Hoy**: no sabemos si una subscripción SaaS es taxable en CA (sí) vs PA (varía).
- **Competidores**: todos tienen matriz de taxability por producto/estado.
- **MVP**: tabla estática `StateTaxability[state][productType] = { taxable: bool, rate: number }` para los 50 estados + 5 product types (SaaS, digital good, physical good, service, mixed). Seed data de Tax Foundation.
- **Esfuerzo**: ~2 días (compilar data es lo caro).

### 🟢 Deseable — para escalar

#### 10. Marketplace facilitator logic
- Para marketplaces (no solo sellers). Avalara y TaxJar lo tienen.
- Esfuerzo: ~5 días.

#### 11. Customer exemption certificates
- Para B2B con resale certs. Avalara CertCapture.
- Esfuerzo: ~1 semana.

#### 12. VAT/GST global
- Expandir más allá de US. Quaderno y Anrok lo tienen.
- Esfuerzo: ~2-3 semanas (cobertura de 100+ países es lo caro).

#### 13. SOC 2 Type I
- Sin esto, enterprise deals se caen. Avalara, Vertex, Sovos lo tienen. Anrok también.
- Esfuerzo: 3-6 meses con Vanta/Drata, $5K-15K.

#### 14. SSO (SAML 2.0, OIDC, Google Workspace, Microsoft Entra)
- Para closed-won de Plan Business.
- Esfuerzo: ~3 días con `@fastify/passport` + WorkOS o Clerk.

#### 15. Data residency (EU)
- Para clientes EU que no quieren data en US. RDS en eu-west-1.
- Esfuerzo: 1-2 semanas.

#### 16. Mobile app
- Solo Quaderno la tiene hoy. No es prioritario.

---

## 4. En qué somos MEJORES

### ✅ Estructural (no replicable por la competencia sin pivotear)

#### A. Open source + self-hostable
- **Único en el mercado.** Avalara/Anrok/Zamp son SaaS cerrado. Si un cliente self-hostea en Hetzner ($7/mo), TCO < $10/mes vs $199/mes de Zamp.
- CPA firms pueden ofrecer "AutoTaxFlow self-hosted for your clients" como servicio blanco. Es el modelo de **Streamlined Sales Tax** pero para indie.
- **Competidores no pueden** sin open-corear su producto (lo cual mataría su modelo de ARR).

#### B. Multi-tenant desde el día 1
- Cada `Organization` es un tenant aislado con `onDelete: Cascade` en cada FK. Borrar una Org nukea todos sus datos, sin huérfanos.
- Los competidores single-tenant te cobran $199/org adicional. AutoTaxFlow incluye hasta 5 orgs en Plan Business ($299) — 60% más barato.
- El rol `CPA_READONLY` permite a firmas CPA ver todas sus client orgs con un solo login. Avalara cobra $400/extra por esto.

#### C. Real-time aggregation con idempotencia real
- Pipeline: Stripe webhook → API persiste `WebhookEvent` (status=PENDING) → BullMQ job con `jobId=webhookId` → Worker → upsert `Transaction` con `@@unique([orgId, provider, sourceId])` → job `aggregate.revenueDaily` → upsert `StateRevenueDaily` + roll-up `StateRevenueMonthly`.
- **Si Redis cae** entre recibir el webhook y procesarlo, el evento sigue en Postgres y un tick periódico lo recupera. La mayoría de los competidores (incluido TaxJar) pierden eventos en este escenario.
- **Reprocesar un webhook** no duplica transacciones por la unique constraint. Avalara no tiene esta garantía documentada.

#### D. Decimal money columns + Decimal(14,2) en agregados
- `Transaction.amount` es `Decimal @db.Decimal(12, 2)`, `StateRevenueMonthly.grossRevenue` es `Decimal(14, 2)`.
- Quaderno y varios indie usan `Float` → errores de redondeo a partir de ~$100K/mes en agregaciones.
- Esto importa: una empresa con $5M ARR y 200 transacciones/día pierde $50-100/mes por float drift.

### ✅ Producto

#### E. Posicionamiento "data middleware, no tax software"
- No calculamos tax, no registramos, no filings → **no somos IRS Circular 230 sujetos**.
- Avalara/TaxJar/Anrok están sujetos a Circular 230 (regulated practice) → compliance overhead masivo, seguros E&O carísimos.
- AutoTaxFlow es un dashboard de exposición + alertas. Si el CPA comete un error de filing, el cliente no nos demanda a nosotros.
- Esto reduce nuestro costo operativo estructural.

#### F. Custom rules engine (`Ruleset` → `Rule[]` con `params: Json`)
- Cada cliente puede definir umbrales propios (ej: "Para NY, alertar a partir de $50K aunque el threshold estatal sea $100K").
- TaxJar y Stripe Tax tienen thresholds hardcoded al estatal. Kintsugi tiene AI rules pero opacas.
- Esto nos permite vender a empresas conservadoras (healthcare, fintech) que quieren umbrales más bajos que el regulado.

#### G. Transparent pricing + flat subscription
- $79/$149/$299 publicado en `docs/ANALISIS_DE_NEGOCIO.md`.
- Stripe Tax es 0.5% del volume → una empresa con $5M ARR paga $25,000/año solo en tax calc. AutoTaxFlow Pro $1,788/año. **92% más barato** en ese rango.
- Avalara requiere sales call. Kintsugi y Zamp no publican precio entry. AutoTaxFlow es **transparente desde el pricing page**.

#### H. Audit log out-of-the-box
- `AuditLog` table con `action, entity, entityId, details Json, userId, createdAt`.
- Cada operación crítica (crear org, cambiar rol, ack flag, request report) escribe al log.
- Solo Sovos y Vertex tienen audit trails comparables. TaxJar, Stripe Tax, Anrok, Quaderno — no tienen audit log persistente expuesto al usuario.

#### I. Dashboard que muestra la lógica del nexus
- En `/dashboard` mostramos la tabla de revenue por estado con la columna "Nexus risk" que dice "Likely nexus" cuando `grossRevenue >= 100K || txCount >= 200`.
- El usuario entiende **por qué** se disparó. Avalara, TaxJar, Anrok muestran "nexus detected" sin exponer el cálculo.
- Para CPAs esto es crítico — necesitan justificar el filing decision al cliente.

#### J. Type safety end-to-end
- Zod schemas compartidos entre API (Fastify) y Worker (BullMQ) — el payload del job está validado con el mismo schema que el request del webhook.
- Ningún competidor expuesto tiene esto. Numeral tiene Python backend + TS frontend con hand-rolled types.

### ✅ Técnico

#### K. Stripe webhook con raw body correcto
- Usamos `addContentTypeParser('application/json', { parseAs: 'buffer' })` en vez del broken `rawBody: true` que muchos tutoriales recomiendan.
- La verificación de firma `stripe.webhooks.constructEvent(rawBody, sig, secret)` funciona. Hecho smoke test.

#### L. Graceful shutdown SIGTERM/SIGTERM + Redis listeners
- Si Kubernetes (o Docker) manda SIGTERM, el worker termina jobs en vuelo antes de morir. Los competidores suelen perder jobs en deploy.
- Listeners `error`/`close`/`reconnecting` en `redisConnection` previenen crash silencioso.

#### M. Decimal money sin drift
- Cubierto arriba.

#### N. Stripe Connect-aware
- `handleChargeSucceeded` distingue correctamente `event.account` (Connect webhook header) de `charge.on_behalf_of` (acct_xxx en el payload) de `charge.customer` (cus_xxx, NO debe usarse para tenant lookup).
- Bug que vimos en el análisis del repo original — está fixed. TaxJar y otros lo gestionan peor.

---

## 5. Resumen ejecutivo

### Posicionamiento real
AutoTaxFlow **no compite** contra Avalara/Vertex/Sovos (enterprise) ni contra Stripe Tax/TaxJar (filing). Competimos en el nicho:

> **SaaS SMBs en EE.UU. ($100K–$5M ARR) usando Stripe que quieren saber ANTES de tiempo dónde van a tener nexus fiscal, sin pagar 0.5% por transacción ni un sales call de Avalara.**

### Los 3 competidores reales a vigilar
1. **Kintsugi** — Vertex-backed, AI-native, free monitoring tier. Es el competidor existencial más directo.
2. **Zamp** — Stripe Apps presence, managed service. Tienen canal de adquisición optimizado.
3. **Numeral** — API-first para billing custom. Si un cliente usa Chargebee/Recurly en vez de Stripe Billing, ganan ellos.

### Lo que hay que construir ya (roadmap 30 días)
1. **Nexus Engine job** (2 días) — sin esto el producto es un demo.
2. **Email alerts on nexus trigger** (1 día) — feature competitive parity.
3. **Free monitoring tier** (1 día) — gancho de adquisición vs Kintsugi/Zamp.
4. **Landing page** (2-3 días) — sin esto no hay top-of-funnel.
5. **QBO sync real** (3 días) — desbloquea upsell a Plan Pro.
6. **Billing + SaaS self-charge con Stripe Tax** (2 días, dogfooding) — credibility.

### Lo que NUNCA deberíamos construir
- E-invoicing compliance (PEPPOL, NF-e, CFDI). Es mercado de Sovos.
- Customer exemption certificates a escala. Es mercado de Avalara CertCapture.
- Enterprise SSO + SOC 2 ahora. Permite selling al enterprise, pero el costo de compliance nos mata antes del break-even.

### Mensaje de pitch para el website
> "Avalara for the rest of us. Open-source, self-hostable, flat subscription. Know your nexus risk across 50 states — without a sales call, without per-transaction fees, without Circular 230 overhead."

---

## 6. Matriz de decisión "comprar vs AutoTaxFlow"

| Si el prospect es... | Compra... | Razón |
|---|---|---|
| Enterprise >$50M ARR | Avalara | Necesitan SOC 2 + e-invoicing + exemption certs |
| SaaS scaling $5M-$50M | Anrok / Numeral | Necesitan filing automation real |
| E-commerce Shopify < $1M | TaxJar | Plugin Shopify + AutoFile barato |
| Cross-border EU+US | Quaderno | Necesitan VAT/GST global |
| Marketplace (Etsy-style) | Avalara / TaxJar | Marketplace facilitator logic |
| SMB US $100K-$5M en Stripe, solo quiere saber dónde tiene nexus | **AutoTaxFlow** | Open source, transparent, sin Circular 230, flat $79-299/mes |
| CPA firm que quiere servir 30+ clientes SMB | **AutoTaxFlow CPA Partner** | $49/org, multi-tenant desde día 1 |

---

## 7. Fuentes

- https://www.avalara.com — nexus thresholds, enterprise tier
- https://taxcloud.com/blog/avalara-cost — Avalara pricing data ($16,717/yr avg)
- https://support.stripe.com/articles/understanding-stripe-tax-pricing — Stripe Tax pricing (0.5%/tx or $0.50/tx)
- https://www.galvix.com/blog/stripe-tax — 0.5% confirmation
- https://support.taxjar.com — TaxJar Starter $39/mo, Pro $99/mo
- https://zamp.com — Zamp vs Anrok vs Numeral comparison
- https://anrok.com — Anrok Wayfair explainer, SaaS focus
- https://www.businesswire.com — Anrok $100M funding
- https://www.suiteapp.com — Anrok NetSuite integration, 11K+ jurisdictions
- https://quaderno.io — Quaderno cross-border positioning
- https://www.getsphere.com — competitor pricing benchmarks
- https://kintsugi.com — Free monitoring + $75/filing pricing
- https://ir.vertexinc.com — Vertex strategic investment in Kintsugi
- https://docs.numeral.com — Numeral API billing-layer integration
- https://www.streamlinedsalestax.org — TaxCloud pricing tiers
