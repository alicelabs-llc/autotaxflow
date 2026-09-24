import { prisma, TransactionType } from '@autotaxflow/db';
import type { AggregateDailyJobData } from '@autotaxflow/shared';
import { aggregateRevenue } from './aggregate.math';

/**
 * Agregación diaria + roll-up mensual por estado.
 * Idempotencia: si se ejecuta N veces con los mismos args, el resultado final es el mismo
 * porque el upsert recalcula desde la tabla de transactions source-of-truth.
 *
 * Lógica:
 *   - Suma todos CHARGE amounts para grossRevenue.
 *   - Suma todos REFUND amounts para refundsAmount.
 *   - netRevenue = grossRevenue - refundsAmount.
 *   - txCount = count(CHARGE) + count(REFUND).
 */
export async function processAggregateDaily(data: AggregateDailyJobData) {
  const { organizationId, date, state } = data;
  const day = new Date(date + 'T00:00:00.000Z');
  const dayStart = new Date(day);
  const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Obtenemos todos los CHARGE y REFUND de ese día/estado.
  // Excluimos transactions donde un marketplace facilitator recolectó el tax
  // — esas no cuentan para el nexus del seller (el marketplace lo gestiona).
  const [charges, refunds] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        organizationId,
        customerState: state,
        type: TransactionType.CHARGE,
        occurredAt: { gte: dayStart, lte: dayEnd },
        isFacilitatorCollected: false,
      },
      select: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        organizationId,
        customerState: state,
        type: TransactionType.REFUND,
        occurredAt: { gte: dayStart, lte: dayEnd },
        isFacilitatorCollected: false,
      },
      select: { amount: true },
    }),
  ]);

  const dayAgg = aggregateRevenue(
    charges.map((c) => ({ amount: c.amount.toNumber(), type: 'CHARGE' as const })),
    refunds.map((r) => ({ amount: r.amount.toNumber(), type: 'REFUND' as const }))
  );
  const { grossRevenue: gross, netRevenue: net, txCount } = dayAgg;

  // Upsert day aggregation
  await prisma.stateRevenueDaily.upsert({
    where: {
      organizationId_date_state: { organizationId, date: day, state },
    },
    create: {
      organizationId,
      date: day,
      state,
      grossRevenue: gross,
      netRevenue: net,
      txCount,
    },
    update: { grossRevenue: gross, netRevenue: net, txCount },
  });

  // Roll up to monthly
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() + 1;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const [monthCharges, monthRefunds] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        organizationId,
        customerState: state,
        type: TransactionType.CHARGE,
        occurredAt: { gte: monthStart, lte: monthEnd },
        isFacilitatorCollected: false,
      },
      select: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        organizationId,
        customerState: state,
        type: TransactionType.REFUND,
        occurredAt: { gte: monthStart, lte: monthEnd },
        isFacilitatorCollected: false,
      },
      select: { amount: true },
    }),
  ]);

  const mAgg = aggregateRevenue(
    monthCharges.map((c) => ({ amount: c.amount.toNumber(), type: 'CHARGE' as const })),
    monthRefunds.map((r) => ({ amount: r.amount.toNumber(), type: 'REFUND' as const }))
  );
  const { grossRevenue: mGross, netRevenue: mNet, txCount: mCount } = mAgg;

  await prisma.stateRevenueMonthly.upsert({
    where: {
      organizationId_year_month_state: { organizationId, year, month, state },
    },
    create: {
      organizationId,
      year,
      month,
      state,
      grossRevenue: mGross,
      netRevenue: mNet,
      txCount: mCount,
    },
    update: { grossRevenue: mGross, netRevenue: mNet, txCount: mCount },
  });
}
