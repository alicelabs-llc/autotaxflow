import type { FastifyInstance } from 'fastify';
import { transactionRoutes } from './transactions';
import { revenueRoutes } from './revenue';
import { rulesRoutes } from './rules';
import { reportRoutes } from './reports';

/**
 * Bajo /api/orgs/:orgId van todas las rutas que requieren tenancy.
 * Cada sub-router declara su propio preHandler con authenticateJwt + verifyOrganizationAccess.
 * Lo montamos con prefix /api/orgs/:orgId para que todas las sub-rutas hereden el :orgId.
 */
export async function orgScopedRoutes(fastify: FastifyInstance) {
  await fastify.register(transactionRoutes, { prefix: '/transactions' });
  await fastify.register(revenueRoutes, { prefix: '/revenue' });
  await fastify.register(rulesRoutes, { prefix: '' });
  await fastify.register(reportRoutes, { prefix: '/reports' });
}
