import { prisma, FlagStatus, Rule, Severity } from '@autotaxflow/db';
import { isNexusLikely } from './aggregate.math';
import { sendNexusTriggeredEmail } from '../lib/email';

/**
 * Nexus Engine — evalúa los Rulesets activos de una Organization contra las
 * agregaciones mensuales por estado, y hace upsert de NexusFlags cuando se
 * cruzan los thresholds. Idempotente: si el flag ya existe y está OPEN, no
 * se duplica. Si fue RESOLVED pero el threshold sigue cruzado, se reabre.
 *
 * Tipos de regla soportados:
 *   - NEXUS_REVENUE_THRESHOLD   params: { state?, amount }
 *   - NEXUS_TX_THRESHOLD         params: { state?, count }
 *   - EXPENSE_CAT                params: { category, max } // no implementado en este job
 *
 * Defaults implícitos (Wayfair 2018):
 *   - revenue >= $100K en cualquier estado, O
 *   - tx count >= 200 en cualquier estado
 * Si una org no tiene Ruleset custom, evaluamos estos defaults.
 */
export async function runNexusEngineForOrg(organizationId: string): Promise<void> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // 1. Cargamos monthly aggregates del año hasta el mes actual.
  const monthlyRows = await prisma.stateRevenueMonthly.findMany({
    where: { organizationId, year, month: { lte: month } },
  });

  // Suma YTD por estado
  const ytdByState = new Map<string, { gross: number; tx: number }>();
  for (const row of monthlyRows) {
    const cur = ytdByState.get(row.state) || { gross: 0, tx: 0 };
    cur.gross += row.grossRevenue.toNumber();
    cur.tx += row.txCount;
    ytdByState.set(row.state, cur);
  }

  // 2. Cargamos rulesets activos de la org
  const rulesets = await prisma.ruleset.findMany({
    where: { organizationId, isActive: true },
    include: { rules: { where: { isActive: true } } },
  });

  const activeRules: Rule[] = rulesets.flatMap((rs) => rs.rules);

  // 3. Defaults Wayfair si no hay reglas custom de nexus
  const hasCustomNexusRules = activeRules.some(
    (r) => r.type === 'NEXUS_REVENUE_THRESHOLD' || r.type === 'NEXUS_TX_THRESHOLD'
  );

  type EffectiveRule = { type: string; params: any; severity: Severity; ruleId?: string };
  const effectiveRules: EffectiveRule[] = activeRules
    .filter((r) => r.type === 'NEXUS_REVENUE_THRESHOLD' || r.type === 'NEXUS_TX_THRESHOLD')
    .map((r) => ({ type: r.type, params: r.params as any, severity: r.severity, ruleId: r.id }));

  if (!hasCustomNexusRules) {
    effectiveRules.push({
      type: 'NEXUS_REVENUE_THRESHOLD',
      params: { amount: 100_000 },
      severity: Severity.HIGH,
    });
    effectiveRules.push({
      type: 'NEXUS_TX_THRESHOLD',
      params: { count: 200 },
      severity: Severity.MEDIUM,
    });
  }

  // 4. Para cada estado, evaluar todas las reglas
  const triggered: Array<{
    state: string;
    severity: Severity;
    reason: string;
    ruleId?: string;
  }> = [];

  for (const [state, agg] of ytdByState.entries()) {
    for (const rule of effectiveRules) {
      let crossed = false;
      let reason = '';

      if (rule.type === 'NEXUS_REVENUE_THRESHOLD') {
        const threshold = rule.params.amount ?? 100_000;
        const targetState = rule.params.state;
        if (targetState && targetState !== state) continue;
        if (agg.gross >= threshold) {
          crossed = true;
          reason = `State ${state} YTD gross revenue $${agg.gross.toFixed(2)} crossed threshold $${threshold}`;
        }
      } else if (rule.type === 'NEXUS_TX_THRESHOLD') {
        const threshold = rule.params.count ?? 200;
        const targetState = rule.params.state;
        if (targetState && targetState !== state) continue;
        if (agg.tx >= threshold) {
          crossed = true;
          reason = `State ${state} YTD transaction count ${agg.tx} crossed threshold ${threshold}`;
        }
      }

      if (crossed) {
        triggered.push({ state, severity: rule.severity, reason, ruleId: rule.ruleId });
      }
    }
  }

  // 5. Upsert de flags — idempotencia: si ya existe OPEN para el mismo state+ruleId,
  //    solo actualizamos lastSeenAt. Si fue RESOLVED y se vuelve a cruzar, reabrimos.
  const newFlags: Array<{ state: string; severity: Severity; reason: string }> = [];

  for (const t of triggered) {
    const existing = await prisma.nexusFlag.findFirst({
      where: {
        organizationId,
        state: t.state,
        ...(t.ruleId ? { ruleId: t.ruleId } : { ruleId: null }),
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (existing) {
      // Update lastSeenAt. Reopen if was RESOLVED.
      await prisma.nexusFlag.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          status: existing.status === FlagStatus.RESOLVED ? FlagStatus.OPEN : existing.status,
          severity: t.severity,
        },
      });
    } else {
      const created = await prisma.nexusFlag.create({
        data: {
          organizationId,
          state: t.state,
          ruleId: t.ruleId || null,
          severity: t.severity,
          reason: t.reason,
          status: FlagStatus.OPEN,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      newFlags.push({ state: created.state, severity: created.severity, reason: created.reason });
    }
  }

  // 6. Disparar email alerts si se crearon nuevos flags.
  if (newFlags.length > 0) {
    await sendNexusTriggeredEmail(organizationId, newFlags);
  }
}

/**
 * Job runner que itera sobre todas las orgs y ejecuta el motor.
 * Pensado para ser corrido como BullMQ repeatable job cada 1h, o
 * manualmente vía `npm run engine:run`.
 */
export async function runNexusEngineAllOrgs(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { tier: { not: 'CPA_PARTNER' } },
    select: { id: true, name: true },
  });

  for (const org of orgs) {
    try {
      await runNexusEngineForOrg(org.id);
    } catch (err) {
      console.error(`[nexus-engine] failed for org ${org.id} (${org.name}):`, (err as Error).message);
    }
  }
}
