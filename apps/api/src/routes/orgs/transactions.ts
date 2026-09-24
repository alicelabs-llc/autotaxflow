import type { FastifyInstance } from 'fastify';
import { prisma, ProviderName } from '@autotaxflow/db';
import { GetTransactionsQuery } from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';

/**
 * GET /api/orgs/:orgId/transactions — lista transacciones normalizadas, paginadas y filtrables.
 */
export async function transactionRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    schema: { querystring: zodSchema(GetTransactionsQuery) },
    handler: async (request, reply) => {
      const query = request.query as ReturnType<typeof GetTransactionsQuery.parse>;
      const orgId = request.currentOrgId!;

      const where = {
        organizationId: orgId,
        occurredAt: { gte: new Date(query.from), lte: new Date(query.to) },
        ...(query.state ? { customerState: query.state } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.provider ? { sourceProvider: query.provider as ProviderName } : {}),
      };

      const [total, data] = await prisma.$transaction([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            sourceProvider: true,
            sourceId: true,
            type: true,
            amount: true,
            currency: true,
            occurredAt: true,
            customerState: true,
            customerCountry: true,
            category: true,
          },
        }),
      ]);

      return reply.send({
        data: data.map((t) => ({
          ...t,
          amount: t.amount.toNumber(),
          occurredAt: t.occurredAt.toISOString(),
        })),
        meta: { total, page: query.page, limit: query.limit },
      });
    },
  });
}
