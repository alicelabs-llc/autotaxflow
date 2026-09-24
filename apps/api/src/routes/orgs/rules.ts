import type { FastifyInstance } from 'fastify';
import { prisma, FlagStatus, Severity, Role } from '@autotaxflow/db';
import {
  CreateRulesetBody,
  CreateRuleBody,
  GetFlagsQuery,
  UpdateFlagBody,
} from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';
import { writeAudit, AuditAction } from '../../lib/audit';

/**
 * POST   /api/orgs/:orgId/rulesets              — crea un ruleset (ADMIN+)
 * POST   /api/orgs/:orgId/rulesets/:id/rules    — añade una regla (ADMIN+)
 * GET    /api/orgs/:orgId/rulesets               — lista rulesets
 * GET    /api/orgs/:orgId/nexus/flags            — lista nexus flags (filtrable)
 * PATCH  /api/orgs/:orgId/nexus/flags/:flagId   — ack/resolve (FINANCE+)
 */
export async function rulesRoutes(fastify: FastifyInstance) {
  fastify.post('/rulesets', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN),
    ],
    schema: { body: zodSchema(CreateRulesetBody) },
    handler: async (request, reply) => {
      const { name } = request.body as ReturnType<typeof CreateRulesetBody.parse>;
      const ruleset = await prisma.ruleset.create({
        data: { organizationId: request.currentOrgId!, name },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.RULESET_CREATED,
        entity: 'Ruleset',
        entityId: ruleset.id,
        details: { name },
      });
      return reply.status(201).send({ ruleset });
    },
  });

  fastify.get('/rulesets', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const rulesets = await prisma.ruleset.findMany({
        where: { organizationId: request.currentOrgId! },
        include: { rules: true },
      });
      return reply.send({ rulesets });
    },
  });

  fastify.post('/rulesets/:rulesetId/rules', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN),
    ],
    schema: { body: zodSchema(CreateRuleBody) },
    handler: async (request, reply) => {
      const { rulesetId } = request.params as { rulesetId: string };
      const body = request.body as ReturnType<typeof CreateRuleBody.parse>;
      // Validate ruleId belongs to this org
      const ruleset = await prisma.ruleset.findFirst({
        where: { id: rulesetId, organizationId: request.currentOrgId! },
      });
      if (!ruleset) return reply.status(404).send({ error: 'Ruleset not found' });
      const rule = await prisma.rule.create({
        data: {
          rulesetId,
          type: body.type,
          params: body.params,
          severity: body.severity as Severity,
          isActive: body.isActive,
        },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.RULE_CREATED,
        entity: 'Rule',
        entityId: rule.id,
        details: { type: rule.type, rulesetId },
      });
      return reply.status(201).send({ rule });
    },
  });

  fastify.get('/nexus/flags', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    schema: { querystring: zodSchema(GetFlagsQuery) },
    handler: async (request, reply) => {
      const { status } = request.query as ReturnType<typeof GetFlagsQuery.parse>;
      const flags = await prisma.nexusFlag.findMany({
        where: {
          organizationId: request.currentOrgId!,
          ...(status ? { status: status as FlagStatus } : {}),
        },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      });
      return reply.send({
        flags: flags.map((f) => ({
          id: f.id,
          state: f.state,
          severity: f.severity,
          reason: f.reason,
          status: f.status,
          firstSeenAt: f.firstSeenAt.toISOString(),
          lastSeenAt: f.lastSeenAt.toISOString(),
        })),
      });
    },
  });

  fastify.patch('/nexus/flags/:flagId', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE, Role.CPA_READONLY),
    ],
    schema: { body: zodSchema(UpdateFlagBody) },
    handler: async (request, reply) => {
      const { flagId } = request.params as { flagId: string };
      const { status } = request.body as ReturnType<typeof UpdateFlagBody.parse>;
      const existing = await prisma.nexusFlag.findFirst({
        where: { id: flagId, organizationId: request.currentOrgId! },
      });
      if (!existing) return reply.status(404).send({ error: 'Flag not found' });
      const flag = await prisma.nexusFlag.update({
        where: { id: flagId },
        data: { status: status as FlagStatus, lastSeenAt: new Date() },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action:
          status === 'RESOLVED' ? AuditAction.FLAG_RESOLVED : AuditAction.FLAG_ACKNOWLEDGED,
        entity: 'NexusFlag',
        entityId: flagId,
        details: { newState: status },
      });
      return reply.send({ flag });
    },
  });
}
