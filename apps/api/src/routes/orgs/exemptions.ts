import type { FastifyInstance } from 'fastify';
import { prisma, ExemptionType, ExemptionStatus, Role } from '@autotaxflow/db';
import { zodSchema } from '../../lib/zod-schema';
import { z } from 'zod';
import { writeAudit, AuditAction } from '../../lib/audit';

const CreateExemptionBody = z.object({
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  customerState: z.string().length(2),
  exemptionType: z.enum([
    'RESALE',
    'MANUFACTURING',
    'NONPROFIT',
    'GOVERNMENT',
    'AGRICULTURAL',
    'OTHER',
  ]),
  certificateNumber: z.string().min(1).max(100),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional().nullable(),
  fileUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

const UpdateExemptionStatusBody = z.object({
  status: z.enum(['VALID', 'EXPIRED', 'REJECTED']),
  notes: z.string().optional(),
});

/**
 * CRUD para Exemption Certificates.
 *
 * POST   /api/orgs/:orgId/exemptions              — subir nuevo cert (FINANCE+)
 * GET    /api/orgs/:orgId/exemptions              — listar certs
 * GET    /api/orgs/:orgId/exemptions/:id          — detalle
 * PATCH  /api/orgs/:orgId/exemptions/:id          — validar/rechazar (FINANCE+)
 * DELETE /api/orgs/:orgId/exemptions/:id          — borrar (OWNER/ADMIN)
 */
export async function exemptionRoutes(fastify: FastifyInstance) {
  fastify.post('/', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE, Role.CPA_READONLY),
    ],
    schema: { body: zodSchema(CreateExemptionBody) },
    handler: async (request, reply) => {
      const body = request.body as ReturnType<typeof CreateExemptionBody.parse>;
      const cert = await prisma.exemptionCertificate.create({
        data: {
          organizationId: request.currentOrgId!,
          customerEmail: body.customerEmail,
          customerName: body.customerName,
          customerState: body.customerState,
          exemptionType: body.exemptionType as ExemptionType,
          certificateNumber: body.certificateNumber,
          issuedAt: new Date(body.issuedAt),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          fileUrl: body.fileUrl,
          notes: body.notes,
          status: ExemptionStatus.PENDING_REVIEW,
        },
      });
      return reply.status(201).send({ exemption: cert });
    },
  });

  fastify.get('/', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const certs = await prisma.exemptionCertificate.findMany({
        where: { organizationId: request.currentOrgId! },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ exemptions: certs });
    },
  });

  fastify.get('/:id', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const cert = await prisma.exemptionCertificate.findFirst({
        where: { id, organizationId: request.currentOrgId! },
      });
      if (!cert) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ exemption: cert });
    },
  });

  fastify.patch('/:id', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE, Role.CPA_READONLY),
    ],
    schema: { body: zodSchema(UpdateExemptionStatusBody) },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as ReturnType<typeof UpdateExemptionStatusBody.parse>;
      const cert = await prisma.exemptionCertificate.update({
        where: { id },
        data: {
          status: body.status as ExemptionStatus,
          reviewedByUserId: request.currentUserId,
          reviewedAt: new Date(),
          notes: body.notes,
        },
      });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.FLAG_RESOLVED, // reuse action for cert review
        entity: 'ExemptionCertificate',
        entityId: id,
        details: { newStatus: body.status },
      });
      return reply.send({ exemption: cert });
    },
  });

  fastify.delete('/:id', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN),
    ],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await prisma.exemptionCertificate.deleteMany({
        where: { id, organizationId: request.currentOrgId! },
      });
      return reply.status(204).send();
    },
  });
}
