import { prisma } from '@autotaxflow/db';

export const AuditAction = {
  ORG_CREATED: 'ORG_CREATED',
  ORG_UPDATED: 'ORG_UPDATED',
  MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
  MEMBERSHIP_ROLE_CHANGED: 'MEMBERSHIP_ROLE_CHANGED',
  RULESET_CREATED: 'RULESET_CREATED',
  RULE_CREATED: 'RULE_CREATED',
  FLAG_ACKNOWLEDGED: 'FLAG_ACKNOWLEDGED',
  FLAG_RESOLVED: 'FLAG_RESOLVED',
  REPORT_REQUESTED: 'REPORT_REQUESTED',
  CONNECTED_ACCOUNT_LINKED: 'CONNECTED_ACCOUNT_LINKED',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export async function writeAudit(opts: {
  organizationId: string;
  userId?: string;
  action: AuditActionValue;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: opts.organizationId,
        userId: opts.userId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        details: opts.details as unknown as never,
      },
    });
  } catch (err) {
    // El audit log no debe romper el flujo principal.
    console.error('[audit] failed to write:', (err as Error).message);
  }
}
