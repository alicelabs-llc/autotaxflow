import type { FastifyInstance } from 'fastify';
import { qboIntegrationRoutes } from './qbo';

/**
 * Integration OAuth flows: QBO (Stripe uses its own webhook path, not OAuth here).
 */
export async function integrationsRoutes(fastify: FastifyInstance) {
  await fastify.register(qboIntegrationRoutes, { prefix: '/qbo' });
}
