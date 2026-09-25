import type { FastifyInstance } from 'fastify';
import { prisma } from '@autotaxflow/db';
import { GetRevenueByStateQuery } from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';

/**
 * GET /api/orgs/:orgId/revenue/states — revenue agregado por estado (mensual o anual).
 * Devuelve un array de { state, grossRevenue, netRevenue, txCount }.
 */
export async function revenueRoutes(fastify: FastifyInstance) {
  fastify.get('/states', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    schema: { querystring: zodSchema(GetRevenueByStateQuery) },
    handler: async (request, reply) => {
      const { year, month } = request.query as ReturnType<typeof GetRevenueByStateQuery.parse>;
      const orgId = request.currentOrgId!;

      const where = month
        ? { organizationId: orgId, year, month }
        : { organizationId: orgId, year };

      const rows = await prisma.stateRevenueMonthly.findMany({
        where,
        orderBy: { grossRevenue: 'desc' },
      });

      return reply.send(
        rows.map((r) => ({
          state: r.state,
          grossRevenue: r.grossRevenue.toNumber(),
          netRevenue: r.netRevenue.toNumber(),
          txCount: r.txCount,
        }))
      );
    },
  });

  fastify.get('/states/:state/daily', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { state } = request.params as { state: string };
      const { year, month } = request.query as { year: number; month?: number };
      const orgId = request.currentOrgId!;

      const startDate = month
        ? new Date(Date.UTC(year, month - 1, 1))
        : new Date(Date.UTC(year, 0, 1));
      const endDate = month
        ? new Date(Date.UTC(year, month, 0, 23, 59, 59))
        : new Date(Date.UTC(year, 11, 31, 23, 59, 59));

      const rows = await prisma.stateRevenueDaily.findMany({
        where: {
          organizationId: orgId,
          state,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      return reply.send(
        rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          grossRevenue: r.grossRevenue.toNumber(),
          netRevenue: r.netRevenue.toNumber(),
          txCount: r.txCount,
        }))
      );
    },
  });
}
