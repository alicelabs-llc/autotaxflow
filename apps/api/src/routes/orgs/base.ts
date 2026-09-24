import type { FastifyInstance } from 'fastify';
import { prisma, Role } from '@autotaxflow/db';
import { CreateOrgBody } from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';
import { writeAudit, AuditAction } from '../../lib/audit';

/**
 * POST   /api/orgs                       — crea org y membresía OWNER para el user autenticado
 * GET    /api/orgs                       — lista las orgs del user autenticado
 * GET    /api/orgs/:orgId                — detalle de una org (requiere membership)
 * GET    /api/orgs/:orgId/members        — miembros
 * PATCH  /api/orgs/:orgId/members/:uid   — cambiar rol (OWNER/ADMIN only)
 *
 * Las rutas con :orgId usan fastify.verifyOrganizationAccess como preHandler.
 */
export async function orgRoutes(fastify: FastifyInstance) {
  fastify.post('/', {
    preHandler: [fastify.authenticateJwt],
    schema: { body: zodSchema(CreateOrgBody) },
    handler: async (request, reply) => {
      const { sub: userId } = request.user;
      const body = request.body as ReturnType<typeof CreateOrgBody.parse>;

      const org = await prisma.organization.create({
        data: {
          name: body.name,
          country: body.country,
          baseCurrency: body.baseCurrency,
          memberships: { create: { userId, role: Role.OWNER } },
        },
        include: { memberships: true },
      });

      await writeAudit({
        organizationId: org.id,
        userId,
        action: AuditAction.ORG_CREATED,
        entity: 'Organization',
        entityId: org.id,
        details: { name: org.name },
      });

      return reply.status(201).send({ organization: org });
    },
  });

  fastify.get('/', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { sub: userId } = request.user;
      const memberships = await prisma.membership.findMany({
        where: { userId },
        include: { organization: true },
      });
      return reply.send({
        organizations: memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          country: m.organization.country,
          baseCurrency: m.organization.baseCurrency,
          role: m.role,
        })),
      });
    },
  });

  fastify.get('/:orgId', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const org = await prisma.organization.findUnique({
        where: { id: request.currentOrgId! },
        include: { _count: { select: { memberships: true, transactions: true } } },
      });
      return reply.send({ organization: org });
    },
  });

  fastify.get('/:orgId/members', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const members = await prisma.membership.findMany({
        where: { organizationId: request.currentOrgId! },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      return reply.send({ members });
    },
  });

  fastify.patch('/:orgId/members/:userId', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN),
    ],
    handler: async (request, reply) => {
      const { userId: targetUserId } = request.params as { userId: string };
      const { role } = request.body as { role: Role };
      if (!Object.values(Role).includes(role)) {
        return reply.status(400).send({ error: 'Invalid role' });
      }
      const updated = await prisma.membership.update({
        where: {
          organizationId_userId: {
            organizationId: request.currentOrgId!,
            userId: targetUserId,
          },
        },
        data: { role },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.MEMBERSHIP_ROLE_CHANGED,
        entity: 'Membership',
        entityId: updated.id,
        details: { newRole: role, targetUserId },
      });
      return reply.send({ membership: updated });
    },
  });
}
