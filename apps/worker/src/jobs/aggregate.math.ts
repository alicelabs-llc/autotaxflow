/**
 * Lógica pura de agregación — separada de la capa de DB para poder testear.
 * La capa de jobs (`aggregate.ts`) llama a estas funciones con los datos crudos
 * y aplica los upserts.
 */

export interface AggregatedRow {
  grossRevenue: number;
  netRevenue: number;
  txCount: number;
}

export interface RawTx {
  amount: number;
  type: 'CHARGE' | 'REFUND' | 'PAYMENT' | 'TRANSFER' | 'DISPUTE';
}

/**
 * Dados los CHARGE y REFUND de un periodo, devuelve el agregado.
 * - gross = Σ CHARGE amounts
 * - refunds = Σ REFUND amounts (positivo en DB)
 * - net = gross - refunds
 * - txCount = #CHARGE + #REFUND
 */
export function aggregateRevenue(charges: RawTx[], refunds: RawTx[]): AggregatedRow {
  const gross = charges.reduce((s, t) => s + t.amount, 0);
  const refundsAmount = refunds.reduce((s, t) => s + t.amount, 0);
  return {
    grossRevenue: round2(gross),
    netRevenue: round2(gross - refundsAmount),
    txCount: charges.length + refunds.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Heuristic: economic nexus is likely triggered for a state if
 * grossRevenue >= 100_000 OR txCount >= 200 (per the South Dakota v. Wayfair 2018 ruling).
 */
export function isNexusLikely(grossRevenue: number, txCount: number): boolean {
  return grossRevenue >= 100_000 || txCount >= 200;
}
