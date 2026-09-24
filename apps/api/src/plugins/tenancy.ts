import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma, Role } from '@autotaxflow/db';
import type { JwtPayload } from '../plugins/auth';

declare module 'fastify' {
  interface FastifyRequest {
    currentOrgId?: string;
    currentUserRole?: Role;
    currentUserId?: string;
  }
}

/**
 * Tenancy hook: valida que request.user.sub (del JWT) tiene membresía
 * en la org del path param :orgId. Inyecta currentOrgId/currentUserRole
 * en la request. Si no es miembro → 403.
 *
 * Debe registrarse como preHandler en rutas /api/orgs/:orgId/*
 */
async function verifyOrganizationAccess(
  this: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { orgId } = request.params as { orgId?: string };
  const user = request.user as JwtPayload | undefined;

  if (!orgId) {
    return reply.status(400).send({ error: 'orgId is required in path' });
  }
  if (!user?.sub) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.sub },
    },
    select: { role: true },
  });

  if (!membership) {
    return reply.status(403).send({
      error: 'Forbidden: not a member of this organization',
      orgId,
    });
  }

  request.currentOrgId = orgId;
  request.currentUserId = user.sub;
  request.currentUserRole = membership.role;
}

/**
 * Helper de autorización por rol mínimo.
 * USA `return` para short-circuit. Sin esto el handler sigue ejecutando.
 *
 *   { preHandler: [verifyOrganizationAccess, requireRole(Role.ADMIN)] }
 */
export function requireRole(...minRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUserRole || !minRoles.includes(request.currentUserRole)) {
      return reply.status(403).send({
        error: 'Forbidden: insufficient role',
        required: minRoles,
        current: request.currentUserRole,
      });
    }
  };
}

/**
 * Plugin que decora la instancia con el hook para usar como preHandler.
 */
async function tenancyPlugin(fastify: FastifyInstance) {
  fastify.decorate('verifyOrganizationAccess', verifyOrganizationAccess);
  fastify.decorate('requireRole', requireRole);
}

declare module 'fastify' {
  interface FastifyInstance {
    verifyOrganizationAccess: typeof verifyOrganizationAccess;
    requireRole: (...roles: Role[]) => (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;
  }
}

export default fp(tenancyPlugin, { name: 'tenancy' });
