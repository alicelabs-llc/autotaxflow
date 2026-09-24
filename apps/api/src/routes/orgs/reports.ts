import type { FastifyInstance } from 'fastify';
import { prisma, ReportStatus, ReportType, Role } from '@autotaxflow/db';
import { RequestReportBody } from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';
import { reportQueue } from '../../lib/bullmq';
import { writeAudit, AuditAction } from '../../lib/audit';

/**
 * POST  /api/orgs/:orgId/reports               — encola generación de reporte (FINANCE+)
 * GET   /api/orgs/:orgId/reports               — lista reportes
 * GET   /api/orgs/:orgId/reports/:reportId      — detalle de un reporte
 * GET   /api/orgs/:orgId/reports/:reportId/download — devuelve downloadUrl (cuando READY)
 */
export async function reportRoutes(fastify: FastifyInstance) {
  fastify.post('/', {
    preHandler: [
      fastify.authenticateJwt,
      fastify.verifyOrganizationAccess,
      fastify.requireRole(Role.OWNER, Role.ADMIN, Role.FINANCE, Role.CPA_READONLY),
    ],
    schema: { body: zodSchema(RequestReportBody) },
    handler: async (request, reply) => {
      const body = request.body as ReturnType<typeof RequestReportBody.parse>;
      const report = await prisma.report.create({
        data: {
          organizationId: request.currentOrgId!,
          type: body.type as ReportType,
          periodStart: new Date(body.periodStart),
          periodEnd: new Date(body.periodEnd),
          status: ReportStatus.PENDING,
        },
      });
      await reportQueue.add('report.generate', { reportId: report.id });
      await writeAudit({
        organizationId: request.currentOrgId!,
        userId: request.currentUserId,
        action: AuditAction.REPORT_REQUESTED,
        entity: 'Report',
        entityId: report.id,
        details: { type: body.type, periodStart: body.periodStart, periodEnd: body.periodEnd },
      });
      return reply.status(202).send({
        id: report.id,
        status: report.status,
      });
    },
  });

  fastify.get('/', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const reports = await prisma.report.findMany({
        where: { organizationId: request.currentOrgId! },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ reports });
    },
  });

  fastify.get('/:reportId', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { reportId } = request.params as { reportId: string };
      const report = await prisma.report.findFirst({
        where: { id: reportId, organizationId: request.currentOrgId! },
      });
      if (!report) return reply.status(404).send({ error: 'Report not found' });
      return reply.send({ report });
    },
  });

  fastify.get('/:reportId/download', {
    preHandler: [fastify.authenticateJwt, fastify.verifyOrganizationAccess],
    handler: async (request, reply) => {
      const { reportId } = request.params as { reportId: string };
      const report = await prisma.report.findFirst({
        where: { id: reportId, organizationId: request.currentOrgId! },
      });
      if (!report) return reply.status(404).send({ error: 'Report not found' });
      if (report.status !== ReportStatus.READY || !report.fileUrl) {
        return reply.status(409).send({ error: 'Report not ready', status: report.status });
      }
      // En MVP local, fileUrl es path local o presigned. Devolvemos directamente.
      return reply.send({
        downloadUrl: report.fileUrl,
        expiresIn: 300,
      });
    },
  });
}
