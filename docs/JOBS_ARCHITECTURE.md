# AutoTaxFlow - Arquitectura de Colas y Workers (BullMQ)

Este documento detalla la estructura y orquestación de los trabajos en segundo plano (Background Jobs) para AutoTaxFlow. Usaremos **BullMQ** anclado a **Redis** para garantizar resiliencia, reintentos exponenciales y aislamiento de fallos ante caídas de la API de Stripe o QuickBooks.

## 1. Topología de Colas

Crearemos múltiples colas lógicas para no bloquear procesos críticos con tareas pesadas:

1.  **`ingest_queue`**: *(Prioridad Crítica)* Exclusiva para procesar los Webhooks en crudo que entran desde `WebhookEvent`. Es rápida. Transforma JSON a `Transaction`.
2.  **`sync_queue`**: *(Prioridad Normal)* Tareas de sincronización en lote (Pull), como extraer todas las expensas del último mes de QuickBooks (paginación larga).
3.  **`aggregate_queue`**: *(Prioridad Normal/Baja)* Cálculos en batch. Toma las nuevas transacciones del día y recalcula los totales de `StateRevenueMonthly`.
4.  **`rules_queue`**: *(Prioridad Baja)* Procesa las reglas configuradas (NexusFlags). Puede tardar varios segundos por cliente.
5.  **`report_queue`**: *(Prioridad Muy Baja)* Generación de archivos (PDFs/CSVs), compresión y subida a S3. Larga duración.

---

## 2. Mapa de Trabajos (Jobs) y Lógica de Reintentos

### A. Ingesta desde Webhooks
**Job:** `stripe.ingestEvent`
*   **Trigger:** Fastify recibe un `POST /webhooks/stripe`, guarda el payload en Postgres y añade el Job (`{ eventId: "evt_123" }`) a la `ingest_queue`.
*   **Worker:** 
    1.  Extrae el `WebhookEvent` de Postgres.
    2.  Normaliza los datos (ej. extrae `shipping.address.state` o `customer.address.state`).
    3.  Aplica heurísticas para el país y el estado.
    4.  Crea la cuenta de `Transaction` (o `Payout`).
    5.  Encola un evento `aggregate.revenueDaily` en la `aggregate_queue`.
*   **Retries (Reintentos):** 3 intentos (Exponential Backoff: 10s, 60s, 5m).
*   **Fallo Final:** Si falla 3 veces, la fila `WebhookEvent` pasa a status `ERROR` para revisión manual.

### B. Sincronización Automática
**Job:** `qbo.syncExpenses`
*   **Trigger:** Cron recurrente (diario a medianoche) o botón manual en UI.
*   **Worker:** 
    1.  Recupera el `refresh_token` de QBO y emite un nuevo `access_token`.
    2.  Llama a QBO API pidiendo "Purchases" o "Bills" del mes.
    3.  Inserta o hace upsert de las filas en `Expense`.
    4.  Aplica reglas de autocategorización en vuelo (ej. "Todo de Stripe es Tarifa de Procesamiento").
*   **Retries:** 5 intentos (Retardos largos: 1m, 5m, 1h, 4h). Las APIs externas (como QBO) suelen tener caídas o rate limits.

### C. Motor de Reglas (El Cerebro)
**Job:** `rules.runRuleset`
*   **Trigger:** Al terminar una agregación mensual o manualmente.
*   **Worker:**
    1.  Carga `StateRevenueMonthly` del tenant en caché (memoria).
    2.  Itera por los estados (NY, CA, IL, etc.).
    3.  Carga el `Ruleset` activo del cliente (ej. CA umbral $500K).
    4.  Compara métricas `if (netRevenue >= rule.threshold)`.
    5.  Si hay *match*, hace un upsert de un `NexusFlag` (`SEVERITY: HIGH`).
*   **Retries:** 1 (no depende de red externa, si falla suele ser un bug de código).

---

## 3. Patrón de Procesamiento (Código Base Worker)

Usaremos la figura de `Worker` y `QueueEvents` para orquestar la infraestructura.

```typescript
// packages/worker/src/queues/ingest.ts
import { Worker, Job } from 'bullmq';

const ingestWorker = new Worker('ingest_queue', async (job: Job) => {
  if (job.name === 'stripe.ingestEvent') {
     // 1. Fetch de BD (Prisma)
     // 2. Map JSON -> Transaction
     // 3. Prisma.$transaction (Insertar Tx + Marcar Webhook como PROCESSED)
  }
}, {
  connection: redisConnection,
  concurrency: 10 // Procesar 10 webhooks en paralelo por hilo de Node
});

ingestWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with ${err.message}`);
  // Aquí podemos mandar latido a Sentry o DataDog
});
```

## 4. Estrategia de Idempotencia y Cadenas

*   **Flows (BullMQ Flows):** Para la generación de un reporte que dependa de sincronizar previamente: usaremos *Flows* para crear dependencias. 
    1. Hijo 1: `qbo.syncExpenses`
    2. Hijo 2: `stripe.syncInvoices`
    3. Padre: `report.generateCpaCsv` (El padre solo corre cuando concluyen los hijos).
*   **Bloqueos Confluyentes (Concurrency):** Configuraremos `concurrency` acorde a la tabla. La inserción a la misma tabla `StateRevenueDaily` desde 5 hilos distintos podría causar un "Race Condition". Usaremos operaciones atómicas en Prisma (como `increment`) o un pequeño *mutex* en Redis temporal.
