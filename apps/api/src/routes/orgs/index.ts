import type { FastifyInstance } from 'fastify';
import { transactionRoutes } from './transactions';
import { revenueRoutes } from './revenue';
import { rulesRoutes } from './rules';
import { reportRoutes } from './reports';
import { taxCalculationRoutes } from './tax';
import { exemptionRoutes } from './exemptions';
import { registrationRoutes } from './registrations';
import { vatRoutes } from './vat';

/**
 * Sub-router montado bajo /api/orgs/:orgId/*.
 * Cada sub-router declara su propio preHandler con authenticateJwt + verifyOrganizationAccess.
 */
export async function orgScopedRoutes(fastify: FastifyInstance) {
  await fastify.register(transactionRoutes, { prefix: '/transactions' });
  await fastify.register(revenueRoutes, { prefix: '/revenue' });
  await fastify.register(rulesRoutes, { prefix: '' });
  await fastify.register(reportRoutes, { prefix: '/reports' });
  await fastify.register(taxCalculationRoutes, { prefix: '/tax' });
  await fastify.register(exemptionRoutes, { prefix: '/exemptions' });
  await fastify.register(registrationRoutes, { prefix: '/registrations' });
  await fastify.register(vatRoutes, { prefix: '/vat' });
}

export { orgRoutes } from './base';
