# AutoTaxFlow - Análisis de Viabilidad, Costos y Arquitectura

## 1. Revisión de Arquitectura

La arquitectura propuesta es **robusta, escalable y emplea patrones estándar de la industria (Enterprise-grade)**. Has tomado decisiones muy acertadas para un producto SaaS (Fintech-ish):

- **API Gateway & Workers (Desacoplamiento):** Usar BullMQ y Redis para delegar la ingesta asíncrona (Webhooks de Stripe) y los trabajos pesados (Sincronización con QBO o Generación de PDFs) es la decisión correcta. Evitarás que la API colapse bajo picos de llamadas webhooks.
- **Monorepo:** Organizarlo en un monorepo (por ejemplo, con TurboRepo o Nx) permitirá a `web`, `api` y `worker` compartir los tipos de TypeScript (`packages/shared`) y los esquemas de la BD (`packages/db`). Esto evitará dolores de cabeza al cambiar la estructura de la base de datos.
- **Elección de Stack Backend:**
  - **Fastify:** Es excelente si buscas bajo overhead y altísimo throughput de peticiones por segundo.
  - **Prisma:** Ideal para acelerar el MVP debido a su Developer Experience (DX), aunque Drizzle es útil si tus queries multi-tenant se vuelven demasiado analíticas. Para tu caso de uso con reglas condicionales de agregación, Prisma funcionará perfectamente bien al principio.
- **Idempotencia e Integraciones:** Has marcado la verificación de firmas webhooks y guardar los `event_id` en `webhook_events` para evitar procesar dobles cargos. Esto es una necesidad crítica que ya tienes mapeada.

**Recomendaciones Arquitectónicas:**

- Para la **encriptación de tokens** (OAuth QBO/Stripe), no uses variables de entorno planas si es posible. Un KMS (Key Management Service) en AWS/GCP o Hashicorp Vault sería ideal, aunque para un MVP `AES-256-GCM` gestionado a nivel de aplicación (usando el módulo `crypto` de Node) es aceptable.
- En Postgres, considera habilitar **Row-Level Security (RLS)** asegurando que ninguna query en la API o Worker devuelva datos ajenos sin un `org_id` explícito inyectado en la conexión o en todas las funciones del repositorio.

## 2. Viabilidad Tecnológica

**Calificación: Alta / Muy Viable.**

Todas las piezas descritas utilizan APIs maduras:

- **Stripe Connect / API:** Las analíticas por estado usando el `customer_state` facturado y la categorización están plenamente documentadas en Stripe. Obtener la metadata e identificar el "nexus" es completamente factible.
- **QBO API:** La integración con QuickBooks Online vía OAuth2 es traicionera en cuanto al manejo y renovación de tokens, pero una vez montado el mecanismo de _refresh token_ automático en un job programado de BullMQ, la tracción de los _Expenses_ u _Accounts_ es un proceso estándar de pull (ETL).
- **Generador PDF/CSV:** Librerías como `pdfmake` o una solución en Puppeteer corren muy bien en Workers, de nuevo justicando tu buena decisión de extraer esta carga de la API principal.

_El principal reto de ingeniería:_ No estará en la arquitectura, sino en el **Motor de Reglas (Rules Engine)**. Definir el JSON y tener un evaluador de reglas dinámico que pueda procesar eficientemente sobre decenas de miles de filas en base de datos requerirá buen diseño de las consultas.

## 3. Estimación de Costos de Infraestructura (MVP / Fase V1)

Ya que has considerado un **Deploy en VPS barato**, este es el desglose estimado (si asumes la carga de desplegar Docker Compose tú mismo frente a hacerlo en Managed Services).

### Escenario A: Startup / PaaS (Menos operaciones, más caro a escala)

- **Frontend Web:** Vercel Pro ($20/mes) - Cero operaciones.
- **Database:** Supabase Pro o Neon DB ($25 a $30/mes) - Backups incluidos.
- **API y Worker:** Render / Railway (2 instancias medias) ($20-$40/mes).
- **Redis:** Upstash Elastic ($10/mes).
- **Total Estimado:** ~$75 - $100 / mes (Te despreocupas del devops).

### Escenario B: VPS Auto-Gestionado (Como mencionaste en tu plan)

Si utilizas **Hetzner** o **DigitalOcean** y despliegas tu propio `docker-compose` con Nginx, Node, Prisma, Redis, Postgres:

- **VPS Principal (4 vCPU, 8GB RAM):** ~$10 - $25/mes en Hetzner o DO Droplet. Soportará sin problema Postgres, Redis, API y Workers.
- **Storage (S3):** Cloudflare R2 (Básicamente $0 al principio o céntimos) o AWS S3 (~$1-$2/mes para archivos planos/PDFs).
- **Total Estimado:** ~$15 - $30 / mes.
  _(Nota: Este modelo requiere configurar tus scripts para respaldos cifrados `pg_dump` con cron jobs a S3)._

## 4. Próximos Pasos (Mi recomendación)

Te sugiero usar **Fastify**, ya que NestJS introduce un _boilerplate_ y curvas de aprendizaje pesadas orientadas más hacia Java/Angular (con Inyección de Dependencias severa). Si el objetivo es el MVP (2-4 semanas), Fastify + Prisma + Zod proveen la confianza tipada (`tRPC` o simplemente `fastify-zod`) sin el peso excesivo.

Dado que querías que no ejecutara nada, he creado el directorio principal de tu proyecto en `C:\Users\Usuario\.gemini\antigravity\scratch\AutoTaxFlow\` y he guardado este reporte ahí.

Si deseas visualizar cómo quedaría el esquema o algún código inicial de inicialización (sin ejecutar instalaciones), dímelo y lo proporciono.
