# AutoTaxFlow - Plan de Acción y Siguientes Pasos (Roadmap)

Con la investigación, el modelo de negocio, la arquitectura y el modelo de datos (Prisma) ya validados, el siguiente paso lógico es trazar la hoja de ruta de ejecución para construir el MVP en las **2 a 4 semanas** estimadas.

Aquí tienes el plan paso a paso que deberíamos seguir cuando decidas pasar de la fase de "investigación" a la fase de "construcción":

---

## FASE 1: Setup de Infraestructura y Fundación (Semana 1)
*El objetivo aquí es tener el esqueleto del proyecto funcionando localmente.*

1.  **Inicialización del Monorepo:** Configurar Turborepo (o npm workspaces) con la siguiente estructura base:
    *   `apps/web` (Next.js para el dashboard)
    *   `apps/api` (Fastify para el gateway)
    *   `apps/worker` (Node.js plano para BullMQ)
    *   `packages/db` (Para compartir Prisma)
    *   `packages/shared` (Para compartir esquemas Zod)
2.  **Entorno Local (Docker):** Crear el archivo `docker-compose.yml` que levante PostgreSQL (base de datos) y Redis (para las colas de BullMQ).
3.  **Base de Datos:** Instalar Prisma en el paquete `db`, insertar el esquema (`schema.prisma`) que ya diseñamos y ejecutar la primera migración para crear las tablas en Postgres.

## FASE 2: Core API, Autenticación y Webhooks (Semana 1-2)
*El objetivo es poder registrar clientes y recibir datos de Stripe crudos de forma segura.*

1.  **Autenticación y Tenancy:** Implementar la lógica para crear Corporaciones (`Organizations`) y Usuarios. (Podemos usar algo rápido como *Better Auth* o mantenerlo simple para el MVP).
2.  **Endpoints Base de la API:** Levantar el servidor Fastify y configurar los middlewares de seguridad (CORS, validación de Zod, extracción del `orgId`).
3.  **Tubería de Stripe (Webhooks):** Implementar el endpoint ciego (`/api/webhooks/stripe`) que verifique la firma de Stripe y guarde el JSON crudo en la tabla `WebhookEvent` de forma idempotente, sin procesarlo aún.

## FASE 3: El Worker de Ingesta y Agregación (Semana 2-3)
*El objetivo es transformar el ruido de Stripe en datos financieros limpios.*

1.  **Configuración de BullMQ:** Inicializar las colas en el servicio `worker` conectadas a Redis.
2.  **El Job de Ingesta (`stripe.ingestEvent`):** Este job tomará un `WebhookEvent` pendiente, lo decodificará y lo transformará en una fila de `Transaction` (extrayendo el monto, fecha y estado del cliente).
3.  **Agregaciones:** Crear el proceso que, tras ingresar nuevas transacciones, actualice las tablas `StateRevenueDaily` y `StateRevenueMonthly` (para saber cuánto se vendió en California vs Texas este mes).

## FASE 4: El Motor de Reglas "Nexus" (Semana 3)
*El corazón del valor de tu producto.*

1.  **Lógica del Engine:** Construir una función que corra todas las noches o después de una gran sincronización. Revisará la tabla `StateRevenueMonthly` y la comparará contra las reglas configuradas por el usuario.
2.  **Generación de Alertas:** Si las ventas en un estado (ej. NY) superan el umbral definido en la regla, el sistema insertará un registro en `NexusFlag` con severidad `HIGH`.

## FASE 5: UI/UX - Dashboard Frontend (Semana 3-4)
*Hacer que los datos sean visibles y elegantes para el usuario final.*

1.  **Layout Base:** Usar Next.js con Tailwind y componentes de `shadcn/ui` para construir la navegación (Sidebar con: Overview, Revenue by State, Flags, Settings).
2.  **Integración de Datos:** Consumir la API de Fastify para mostrar el "Heatmap" de ventas por estado.
3.  **Gestión de Alertas:** Pantalla para que el usuario o su CPA pueda ver las `NexusFlags` y marcarlas como "Revisadas" (`ACKNOWLEDGED`).
4.  **Conexión de Stripe:** El botón en "Settings" que lanza el flujo OAuth para que el cliente conecte su cuenta real.

---

### ¿Cómo seguimos AHORA MISMO (aún en fase de diseño)?

Si aún no quieres escribir código, podemos completar la documentación técnica generando los dos planos que faltan para que la carpeta quede impecable antes de codificar:

1.  **`JOBS_ARCHITECTURE.md`:** Redactar exactamente cómo estructurar las colas de **BullMQ**, los nombres de los trabajos, las dependencias entre ellos y el manejo de reintentos (ej. si falla la API de QBO).
2.  **`DOCKER_COMPOSE.yml` y `INFRA_PLAN.md`:** Dejar la plantilla exacta de contenedores y variables de entorno (`.env.example`) lista para cuando quieras encender la base de datos localmente.

Dime si quieres que documente esos dos puntos (1 y 2) para cerrar la fase teórica, o si ya estás listo para que tiremos el comando `npx create-turbo@latest` y empecemos la Fase 1.
