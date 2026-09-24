# AutoTaxFlow — Análisis Integral de Rentabilidad y Viabilidad

> **Costos · Inversión · APIs · Clientes · Legal · Impuestos · Proyecciones**
>
> ⚠️ *Documento orientativo. No constituye asesoría fiscal ni legal. Consulta a un CPA y abogado.*

---

## 1. Resumen Ejecutivo

AutoTaxFlow es un SaaS B2B dirigido a pequeñas y medianas empresas en EE.UU. que necesitan automatizar la preparación de datos fiscales (revenue por estado, nexus risk, exportes CPA-ready). No es un software de impuestos: es un **middleware de datos financieros + alertas**.

| Métrica | Estimado |
|---|---|
| Inversión inicial mínima (MVP) | $8,000 – $18,000 USD |
| Costo operativo mensual (arranque) | $350 – $700/mes |
| Precio de venta sugerido | $79 – $299/mes por empresa |
| Punto de equilibrio (break-even) | 8 – 15 clientes |
| Margen bruto esperado | 70 – 85% |
| TAM estimado (US SMB con Stripe) | ~900,000 empresas |
| Riesgo legal principal | MEDIO (no es consejo fiscal) |

---

## 2. Modelo de Negocio y Estructura de Precios

### 2.1 Tipo de negocio

SaaS multi-tenant B2B. Ingresos recurrentes mensuales (MRR). Sin ingresos por transacción. Modelo: subscription-only con posible upsell de plan CPA.

### 2.2 Tiers de precio recomendados

| Plan | Precio/mes | Incluye | Target |
|---|---|---|---|
| Starter | $79 | 1 Stripe, revenue by state, CSV export, 3 nexus rules | Freelancers / micro-SaaS |
| Pro | $149 | +QBO sync, PDF reports, expense categorization, 10 reglas | SMB $500K–$2M revenue |
| Business | $299 | Multi-Stripe, 5 usuarios, CPA readonly, API access | $2M+ revenue |
| CPA Partner | $49/org | Read-only para firma CPA, co-branding | Firmas CPA (B2B2B) |

### 2.3 Proyección de ingresos (MRR)

| Período | Clientes | MRR estimado | Costos operativos | Margen |
|---|---|---|---|---|
| Mes 1–2 (MVP) | 0–3 | $0 – $450 | $400 | 🔴 Negativo |
| Mes 3–4 | 5–10 | $600 – $1,500 | $500 | 🟡 Break-even |
| Mes 6 | 20–30 | $2,400 – $6,000 | $700 | 🟢 +$1,700–5,300 |
| Mes 12 | 60–100 | $7,000 – $20,000 | $1,200 | 🟢 +$5,800–18,800 |
| Año 2 | 200–400 | $25,000 – $80,000 | $4,000 | 🟢 SaaS rentable |

> ✅ Un solo cliente Plan Business ($299) ya cubre el 85% del costo operativo mensual. Break-even real está en ~8 clientes Pro.

---

## 3. Inversión Inicial Requerida

### 3.1 Escenario A — Bootstrapped (tú programas)

| Concepto | Costo estimado | Notas |
|---|---|---|
| Dominio + email profesional | $20–50/año | Cloudflare + Google Workspace |
| Infraestructura inicial (VPS) | $0–100/mes | Ver sección 4 |
| APIs y servicios externos | $0–50/mes | Ver sección 5 |
| LLC formation (EE.UU.) | $50–500 | Wyoming/Delaware recomendado |
| Terms of Service + Privacy Policy | $0–300 | Plantillas o abogado básico |
| Stripe Atlas (opcional) | $500 | LLC + cuenta bancaria US incluida |
| Tiempo de desarrollo MVP | 200–400 horas | Si programas tú: $0 cash; freelancer: $3K–12K |
| Marketing (landing, video) | $200–1,000 | Landing DIY + Loom |
| **TOTAL MÍNIMO (tú programas)** | **$300 – $2,000** | Si programas tú mismo |
| **TOTAL con freelancer/equipo** | **$8,000 – $18,000** | Costo razonable para MVP |

> 💡 Si programas tú mismo: la inversión real de cash es menor a $2,000 para un MVP vendible. El principal costo es tu tiempo.

---

## 4. Costos de Infraestructura Mensual

### 4.1 Fase MVP (0–50 clientes)

| Servicio | Opción recomendada | Costo/mes | Notas |
|---|---|---|---|
| VPS / Servidor | Hetzner CAX21 o Contabo | $7–15 | 4 CPU / 8GB RAM — suficiente para MVP |
| Base de datos | PostgreSQL en VPS o Supabase | $0–25 | Supabase free tier = 500MB |
| Redis (Queue/Cache) | Upstash Redis | $0–10 | Free tier 10K cmds/día |
| Object Storage | Cloudflare R2 | $0–5 | Free hasta 10GB; sin egress cost |
| Email transaccional | Resend.com o Postmark | $0–10 | 100 emails/día gratis en Resend |
| SSL / CDN / DNS | Cloudflare free | $0 | Gratis con excelente performance |
| Monitoreo básico | BetterStack (free tier) | $0–20 | Logs + uptime gratuito |
| Backups automáticos | pg_dump → R2 | $0–2 | Solo costo de storage |
| **TOTAL MVP** | | **$7 – $87/mes** | Extremadamente bajo |

### 4.2 Fase Scale (50–500 clientes)

| Servicio | Upgrade | Costo/mes |
|---|---|---|
| App servers | 2x Hetzner + LB o Railway.app | $30–80 |
| Database | Supabase Pro o Neon PostgreSQL | $25–69 |
| Redis | Upstash paid o Redis Cloud | $20–50 |
| Storage | Cloudflare R2 (sigue barato) | $5–20 |
| Email | Postmark o SendGrid Growth | $15–50 |
| Observabilidad | Grafana Cloud + Loki | $0–30 |
| **TOTAL SCALE** | | **$95 – $299/mes** |

---

## 5. Costos de APIs y Servicios Externos

| API / Servicio | Costo | Notas críticas |
|---|---|---|
| Stripe (webhooks + API) | $0 | No cobra por leer datos. AutoTaxFlow SOLO lee, no procesa pagos. |
| QuickBooks Online API (Intuit) | $0–$50+/año | App listing gratuito. App Store: revisión + $50/año. MVP puede operar sin listing. |
| Stripe Connect OAuth | $0 | Para conectar cuentas vía OAuth. Sin costo adicional. |
| OpenAI / ML (categorización) | $0–30/mes | GPT-4o-mini: ~$0.15/1M tokens. 10K transacciones ≈ $0.50. Opcional. |
| PDF generation | $0 | Librería propia (pdfkit). Sin API externa. |
| Auth (sesiones) | $0–25/mes | Better Auth self-hosted ($0) o Clerk.com desde $25/mes. |
| IP Geolocation (fallback) | $0–15/mes | ip-api.com: 10K req/hora gratis. |
| **TOTAL APIs** | **$0 – $95/mes** | La mayor parte es gratuita en MVP |

> ✅ AutoTaxFlow NO paga comisiones a Stripe ni a Intuit por leer datos vía API. El modelo read-only hace que el costo marginal por cliente nuevo sea casi **$0**.

---

## 6. Análisis de Clientes y Mercado

### 6.1 Perfil del cliente ideal (ICP)

| Atributo | Descripción |
|---|---|
| Empresa | SMB en EE.UU. con $100K–$5M de revenue anual |
| Tecnología | Usa Stripe como procesador de pagos (SaaS, ecommerce) |
| Problema | Vende en múltiples estados y no sabe dónde tiene nexus fiscal |
| Decisor de compra | CEO/Founder, CFO, o Controller |
| Influencer | CPA/contador que recomienda la herramienta |
| Pain point | Temporada de impuestos = caos. Datos desordenados. Miedo a auditorías. |
| Willingness to pay | $79–$299/mes (equivale a 1–2 horas de CPA) |

### 6.2 Tamaño de mercado

| Segmento | Estimado | Metodología |
|---|---|---|
| Empresas US que usan Stripe | ~4,000,000+ | Dato público (estimado) |
| Empresas SMB Stripe con multi-state | ~900,000 | ~22% del total |
| Dispuestos a pagar por automatización | ~90,000 | 10% del segmento |
| Mercado alcanzable en 3 años | 5,000–15,000 | Realista con GTM orgánico |
| Revenue potencial (5K clientes × $120 ARPU) | **$7.2M ARR** | Objetivo 3–5 años |

### 6.3 Canales de adquisición

| Canal | Costo | Prioridad |
|---|---|---|
| SEO + Blog (nexus tax, Stripe automation) | $0 (tiempo) | 🔴 Alta |
| Stripe App Marketplace | $0 | 🔴 Muy Alta |
| Intuit App Store | $50/año + revisión | 🔴 Alta |
| Programa de referidos CPA (20% comisión) | Revenue share | 🔴 Alta |
| LinkedIn Ads (CFO, founder) | $500–2,000/mes | 🟡 Media |
| Product Hunt launch | $0 | 🟡 Media |
| Alianzas con firmas CPA | Revenue share | 🔴 Alta |

### 6.4 Métricas SaaS objetivo

| Métrica | Objetivo Año 1 | Objetivo Año 2 | Benchmark |
|---|---|---|---|
| MRR Growth | 15–20%/mes | 10–15%/mes | Top SaaS early: 15%/mes |
| Churn mensual | < 3% | < 2% | B2B SaaS promedio: 2–5% |
| CAC (costo adquisición) | < $200 | < $150 | Ratio CAC:LTV mínimo 1:3 |
| LTV (lifetime value) | > $600 | > $900 | Basado en churn + ARPU |
| NPS objetivo | > 40 | > 50 | SaaS financiero promedio: 35–45 |
| Tiempo hasta first value | < 15 min | < 10 min | Crítico para retención |

---

## 7. Marco Legal — Consideraciones Críticas

> ⚠️ **DISCLAIMER:** Este análisis es informativo, no consejo legal. Consulta un abogado especializado en SaaS y fintech antes de operar.

### 7.1 Riesgo principal: ¿Eres proveedor de servicios fiscales?

| Lo que SÍ hace AutoTaxFlow | Lo que NUNCA debe hacer |
|---|---|
| Agrega y presenta datos financieros | Decirle al usuario "tienes nexus en X estado" |
| Muestra "revenue risk thresholds" configurables | Dar consejos de qué impuestos debe pagar |
| Genera reportes para que el CPA decida | Preparar o presentar declaraciones fiscales |
| Detecta anomalías como alertas | Garantizar cumplimiento fiscal |
| Exporta datos en formato CPA-ready | Actuar como representante fiscal del cliente |

### 7.2 Estructura legal del negocio

| Opción | Costo estimado | Recomendación |
|---|---|---|
| LLC en Wyoming (US) | $50–100 + $50/año | ✅ Mejor para fundador fuera de US |
| LLC en Delaware (US) | $90 + $300/año franchise tax | Si buscas inversión VC |
| Stripe Atlas | $500 (todo incluido) | ✅ Opción más rápida |
| Sole proprietor | $0 | ❌ NO recomendado — sin protección legal |

### 7.3 Documentos legales necesarios (antes del primer cliente)

| Documento | Costo estimado | Prioridad |
|---|---|---|
| Terms of Service (con disclaimer fiscal) | $0–300 | 🔴 Crítica |
| Privacy Policy (CCPA + GDPR básico) | $0–200 | 🔴 Crítica |
| Data Processing Agreement (DPA) | $200–500 | 🟠 Alta |
| Limitation of Liability clause | $0 (incluir en ToS) | 🟠 Alta |

### 7.4 Regulaciones de datos financieros

| Regulación | Aplica | Acción requerida |
|---|---|---|
| PCI DSS | ❌ No (no almacenas tarjetas) | Nunca almacenar card data. Stripe lo maneja. |
| SOC 2 Type II | No al inicio; sí para enterprise | Implementar controles básicos desde el inicio. |
| CCPA (California) | ✅ Si tienes usuarios en CA | Privacy Policy + opt-out + data deletion requests. |
| GDPR (Europa) | ✅ Si tienes usuarios EU | DPA + right to erasure. Evitar EU al inicio si no estás listo. |
| Gramm-Leach-Bliley | ⚠️ Zona gris | Consultar abogado. Puede aplicar a datos financieros. |
| IRS Circular 230 / NATP | ❌ No aplica | Solo si preparas declaraciones fiscales. |

---

## 8. Impuestos del Negocio AutoTaxFlow

> ℹ️ Esta sección aplica a los **impuestos que tú pagas** como negocio, no los de tus clientes.

### 8.1 Sales Tax sobre SaaS — El más sorpresivo

Este es el impuesto que más confunde a fundadores de SaaS: el sales tax estatal sobre software como servicio. La ironía: el mismo problema que resuelves para tus clientes, lo tienes tú.

| Categoría | Detalle |
|---|---|
| Estados que gravan SaaS | ~30+ estados: NY, TX, PA, OH, WA, CT, DC |
| Estados que NO gravan SaaS | CA, FL, CO, IL, OR (con excepciones) |
| Cuándo tienes obligación | Cuando superas $100K revenue o 200 transacciones en un estado (Economic Nexus) |
| Herramienta para automatizar | TaxJar ($19/mes), Avalara, o Stripe Tax ($0.50/tx) |
| Ironía del producto | AutoTaxFlow debería usar Stripe Tax para su propio billing. Demuestra el producto. |

> ✅ En los primeros meses el riesgo es mínimo. Cuando superes $10K–20K en un estado, activa Stripe Tax para tu propio billing.

### 8.2 Impuestos generales del negocio

| Impuesto | Tasa aprox. | Aplica si… |
|---|---|---|
| Federal income tax (pass-through LLC) | 10–37% | Fundador residente US |
| Corporate income tax (C-Corp) | 21% | Estructura C-Corp |
| Self-employment tax | 15.3% | LLC un miembro, residente US |
| State income tax | 0–13.3% | Wyoming: 0%, California: 13.3% |
| Franchise tax Delaware | $300/año | Si formas LLC en Delaware |
| Impuesto en país de residencia del fundador | Varía | **Siempre** — pagas en tu país independientemente |

### 8.3 Principales deducciones fiscales

| Deducción | % Deducible |
|---|---|
| Infraestructura cloud / hosting | 100% |
| APIs y servicios externos | 100% |
| Freelancers / contratistas (Form 1099 si >$600) | 100% |
| Legal y contabilidad | 100% |
| Marketing y publicidad | 100% |
| Software de desarrollo | 100% |
| Suscripciones SaaS (uso comercial) | 100% |
| Home office (si aplica) | Porcentaje proporcional |

---

## 9. Análisis de Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Stripe cambia API o acceso | 🟢 Baja | Alto | Stripe mantiene compatibilidad histórica. Diversificar con QBO. |
| Intuit revoca acceso sin App Store | 🟡 Media | Medio | Aplicar al App Store desde etapa temprana. |
| Demanda por "consejo fiscal erróneo" | 🟢 Muy Baja | Alto | ToS con disclaimer claro. UI siempre dice "consulta tu CPA". |
| Competidor grande (Stripe Tax, Pilot) | 🟡 Media | Medio | Nicho específico: multi-Stripe + QBO + CPA workflow. |
| Churn alto por uso estacional | 🟡 Media | Medio | Plan anual con descuento. Añadir valor todo el año. |
| Data breach / hackeo | 🟢 Baja | Muy Alto | Tokens cifrados. No almacenar datos de tarjeta nunca. |
| CAC alto, difícil adquisición | 🟡 Media | Alto | Canal CPA como multiplicador. Stripe Marketplace como canal principal. |

---

## 10. Resumen Financiero — ¿Es Rentable?

| Escenario | Año 1 | Año 2 | Veredicto |
|---|---|---|---|
| Pesimista (25 clientes, $100 ARPU) | $30K ARR / $20K costos | $50K ARR / $25K costos | 🟡 Viable como side income |
| Base (75 clientes, $130 ARPU) | $117K ARR / $30K costos | $200K ARR / $45K costos | 🟢 Negocio rentable sólido |
| Optimista (200 clientes, $160 ARPU) | $384K ARR / $60K costos | $700K ARR / $100K costos | 🟢 SaaS de alto valor |

### Conclusión por factor

| Factor | Evaluación |
|---|---|
| **Inversión requerida** | Muy baja para SaaS ($2K si programas tú / $18K con equipo) |
| **Margen bruto** | 70–85% — excelente (benchmark industria: 65–80%) |
| **Break-even** | 8–15 clientes — alcanzable en 2–4 meses |
| **Riesgo legal** | Manejable si el posicionamiento es correcto (datos, no asesoría) |
| **Escalabilidad** | Muy alta — costo marginal por cliente nuevo casi $0 |
| **Timing de mercado** | Excelente — Economic Nexus post-Wayfair 2018 creó el problema |
| **Recomendación** | ✅ **PROCEDER. MVP en 4–6 semanas, validar con 5 clientes beta, iterar.** |

> ✅ **Conclusión:** AutoTaxFlow tiene fundamentos económicos sólidos. Alta barrera de ejecución, no de capital. El principal riesgo es la distribución (adquirir clientes), no la tecnología ni los costos.

---

*Documento orientativo elaborado con base en datos públicos de mercado y benchmarks de industria SaaS. No constituye asesoría fiscal, legal ni financiera. Todos los costos y proyecciones son estimados y pueden variar.*
