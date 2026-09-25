import type { FastifyInstance } from 'fastify';
import { prisma, Role, FlagStatus, Tier } from '@autotaxflow/db';
import { canAccessCpaPortal } from '../../lib/tier-limits';

/**
 * GET /api/cpa/summary  — multi-org dashboard para CPA_READONLY role
 * GET /api/cpa/orgs/:orgId/nexus — alias read-only de /api/orgs/:orgId/nexus/flags
 *
 * Solo organizaciones donde el user es CPA_READONLY (o BUSINESS tier con
 * OWNER/ADMIN). Filtro extra: la org target debe tener tier BUSINESS o CPA_PARTNER.
 */
export async function cpaRoutes(fastify: FastifyInstance) {
  fastify.get('/summary', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { sub: userId } = request.user;

      // Trae todas las memberships del user
      const memberships = await prisma.membership.findMany({
        where: { userId },
        include: { organization: true },
      });

      const cpaMemberships = memberships.filter((m) =>
        canAccessCpaPortal(m.role as Role, m.organization.tier as Tier)
      );

      const summaries = await Promise.all(
        cpaMemberships.map(async (m) => {
          const orgId = m.organization.id;
          const year = new Date().getUTCFullYear();

          const [openFlags, resolvedFlags, monthlyAgg] = await Promise.all([
            prisma.nexusFlag.count({
              where: { organizationId: orgId, status: FlagStatus.OPEN },
            }),
            prisma.nexusFlag.count({
              where: { organizationId: orgId, status: FlagStatus.RESOLVED },
            }),
            prisma.stateRevenueMonthly.findMany({
              where: { organizationId: orgId, year },
              select: { grossRevenue: true, txCount: true, state: true },
            }),
          ]);

          const ytdRevenue = monthlyAgg.reduce(
            (s, r) => s + r.grossRevenue.toNumber(),
            0
          );
          const ytdTx = monthlyAgg.reduce((s, r) => s + r.txCount, 0);
          const statesCovered = Array.from(
            new Set(monthlyAgg.map((r) => r.state))
          ).sort();

          return {
            organizationId: orgId,
            organizationName: m.organization.name,
            openFlags,
            resolvedFlags,
            ytdRevenue,
            ytdTx,
            statesCovered,
          };
        })
      );

      return reply.send({ orgs: summaries });
    },
  });
}
