import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Helper que convierte un ZodSchema a JSON Schema para Fastify.
 * Fastify NO entiende Zod directamente; necesita un JSON Schema.
 * Esta función envuelve el schema en el formato `{ body: ... }` / `{ querystring: ... }`
 * que Fastify acepta como `schema` de una ruta.
 */
export function zodSchema<T>(schema: z.ZodType<T>) {
  // Fastify requires a non-strict JSON Schema; zodToJsonSchema produce formato estándar.
  return zodToJsonSchema(schema, { $refStrategy: 'none' });
}
