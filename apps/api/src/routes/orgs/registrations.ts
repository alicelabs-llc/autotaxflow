import type { FastifyInstance } from 'fastify';
import { prisma, RegistrationStatus, Role } from '@autotaxflow/db';
import { zodSchema } from '../../lib/zod-schema';
import { z } from 'zod';
import { writeAudit, AuditAction } from '../../lib/audit';

const CreateRegistrationBody = z.object({
  state: z.string().length(2),
  filingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  notes: z.string().optional(),
});

const UpdateRegistrationBody = z.object({
  status: z.enum([
    'NOT_REGISTERED',
    'REGISTERING',
    'REGISTERED',
    'PERMIT_PENDING',
    'ACTIVE_FILING',
    'VOLUNTARY_CLOSED',
    'REVOKED',
  ]),
  stateTaxId: z.string().optional(),
  permitNumber: z.string().optional(),
  filingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  nextFilingDue: z.string().datetime().optional(),
  notes: z.string().optional(),
});

/**
 * CRUD para State Registrations — trackea el proceso de registro fiscal
 * estatal (NOT_REGISTERED → REGISTERING → REGISTERED → ACTIVE_FILING).
 *
 * POST  /api/orgs/:orgId/registrations                — empezar tracking (FINANCE+)
 * GET   /api/orgs/:orgId/registrations                — listar
 * GET   /api/orgs/:orgId/registrations/:state         — detalle por state
 * PATCH /api/orgs/:orgId/registrations/:state         — actualizar status
 */
export async function registrationRoutes(fastify: FastifyInstance) {
  fastify.post('/', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE),
    ],
    schema: { body: zodSchema(CreateRegistrationBody) },
    handler: async (request, reply) => {
      const body = request.body as ReturnType<typeof CreateRegistrationBody.parse>;
      const reg = await prisma.stateRegistration.upsert({
        where: {
          organizationId_state: {
            organizationId: request.currentOrgId!,
            state: body.state,
          },
        },
        create: {
          organizationId: request.currentOrgId!,
          state: body.state,
          status: RegistrationStatus.REGISTERING,
          filingFrequency: body.filingFrequency,
          notes: body.notes,
        },
        update: {},
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.ORG_UPDATED,
        entity: 'StateRegistration',
        entityId: reg.id,
        details: { state: body.state },
      });
      return reply.status(201).send({ registration: reg });
    },
  });

  fastify.get('/', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const regs = await prisma.stateRegistration.findMany({
        where: { organizationId: request.currentOrgId! },
        orderBy: [{ status: 'asc' }, { state: 'asc' }],
      });
      return reply.send({ registrations: regs });
    },
  });

  fastify.get('/:state', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { state } = request.params as { state: string };
      const reg = await prisma.stateRegistration.findUnique({
        where: {
          organizationId_state: {
            organizationId: request.currentOrgId!,
            state: state.toUpperCase(),
          },
        },
      });
      if (!reg) return reply.status(404).send({ error: 'Not registered in this state' });
      return reply.send({ registration: reg });
    },
  });

  fastify.patch('/:state', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE),
    ],
    schema: { body: zodSchema(UpdateRegistrationBody) },
    handler: async (request, reply) => {
      const { state } = request.params as { state: string };
      const body = request.body as ReturnType<typeof UpdateRegistrationBody.parse>;
      const reg = await prisma.stateRegistration.update({
        where: {
          organizationId_state: {
            organizationId: request.currentOrgId!,
            state: state.toUpperCase(),
          },
        },
        data: {
          status: body.status as RegistrationStatus,
          stateTaxId: body.stateTaxId,
          permitNumber: body.permitNumber,
          filingFrequency: body.filingFrequency,
          nextFilingDue: body.nextFilingDue ? new Date(body.nextFilingDue) : undefined,
          notes: body.notes,
          registeredAt: body.status === 'REGISTERED' ? new Date() : undefined,
        },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.ORG_UPDATED,
        entity: 'StateRegistration',
        entityId: reg.id,
        details: { newState: body.status, state },
      });
      return reply.send({ registration: reg });
    },
  });
}
