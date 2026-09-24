import { describe, it, expect } from 'vitest';
import { Severity } from '@autotaxflow/db';

/**
 * Test de la lógica pura del Nexus Engine — extraída del job real a una función pura
 * para poder testearla sin DB. Esta función replica EXACTAMENTE la lógica de
 * runNexusEngineForOrg en apps/worker/src/jobs/nexus-engine.ts.
 */

interface AggRow {
  state: string;
  gross: number;
  tx: number;
}

interface EffectiveRule {
  type: 'NEXUS_REVENUE_THRESHOLD' | 'NEXUS_TX_THRESHOLD' | 'EXPENSE_CAT';
  params: { amount?: number; count?: number; state?: string };
  severity: Severity;
  ruleId?: string;
}

interface TriggeredFlag {
  state: string;
  severity: Severity;
  reason: string;
  ruleId?: string;
}

function evaluateRulesForState(agg: AggRow, rules: EffectiveRule[]): TriggeredFlag[] {
  const out: TriggeredFlag[] = [];
  for (const rule of rules) {
    if (rule.params.state && rule.params.state !== agg.state) continue;

    if (rule.type === 'NEXUS_REVENUE_THRESHOLD') {
      const threshold = rule.params.amount ?? 100_000;
      if (agg.gross >= threshold) {
        out.push({
          state: agg.state,
          severity: rule.severity,
          ruleId: rule.ruleId,
          reason: `State ${agg.state} YTD gross revenue $${agg.gross.toFixed(2)} crossed threshold $${threshold}`,
        });
      }
    } else if (rule.type === 'NEXUS_TX_THRESHOLD') {
      const threshold = rule.params.count ?? 200;
      if (agg.tx >= threshold) {
        out.push({
          state: agg.state,
          severity: rule.severity,
          ruleId: rule.ruleId,
          reason: `State ${agg.state} YTD transaction count ${agg.tx} crossed threshold ${threshold}`,
        });
      }
    }
    // EXPENSE_CAT is not handled in this job — it's a different rules engine.
  }
  return out;
}

const HIGH = Severity.HIGH;
const MEDIUM = Severity.MEDIUM;

describe('Nexus Engine — evaluateRulesForState (pure logic)', () => {
  const wayfairDefaults: EffectiveRule[] = [
    { type: 'NEXUS_REVENUE_THRESHOLD', params: { amount: 100_000 }, severity: HIGH },
    { type: 'NEXUS_TX_THRESHOLD', params: { count: 200 }, severity: MEDIUM },
  ];

  it('triggers HIGH flag when revenue >= 100K', () => {
    const result = evaluateRulesForState(
      { state: 'CA', gross: 100_000, tx: 50 },
      wayfairDefaults
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(HIGH);
    expect(result[0].state).toBe('CA');
  });

  it('does not trigger any flag when below all thresholds', () => {
    const result = evaluateRulesForState(
      { state: 'CA', gross: 99_999.99, tx: 199 },
      wayfairDefaults
    );
    // revenue 99,999 < 100K → no HIGH
    // tx 199 < 200 → no MEDIUM
    expect(result).toHaveLength(0);
  });

  it('triggers MEDIUM flag when tx count >= 200', () => {
    const result = evaluateRulesForState(
      { state: 'NY', gross: 1_000, tx: 200 },
      wayfairDefaults
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(MEDIUM);
  });

  it('triggers both flags when both thresholds crossed', () => {
    const result = evaluateRulesForState(
      { state: 'TX', gross: 500_000, tx: 1_000 },
      wayfairDefaults
    );
    expect(result).toHaveLength(2);
    const severities = result.map((r) => r.severity).sort();
    expect(severities).toEqual([HIGH, MEDIUM]);
  });

  it('respects custom state-scoped rule (CA only)', () => {
    const rules: EffectiveRule[] = [
      { type: 'NEXUS_REVENUE_THRESHOLD', params: { state: 'CA', amount: 50_000 }, severity: HIGH },
    ];
    expect(
      evaluateRulesForState({ state: 'CA', gross: 50_001, tx: 0 }, rules)
    ).toHaveLength(1);
    expect(
      evaluateRulesForState({ state: 'NY', gross: 50_001, tx: 0 }, rules)
    ).toHaveLength(0);
  });

  it('uses default threshold amount=100000 when not specified', () => {
    const rules: EffectiveRule[] = [
      { type: 'NEXUS_REVENUE_THRESHOLD', params: {}, severity: HIGH },
    ];
    expect(
      evaluateRulesForState({ state: 'FL', gross: 100_001, tx: 0 }, rules)
    ).toHaveLength(1);
    expect(
      evaluateRulesForState({ state: 'FL', gross: 99_999, tx: 0 }, rules)
    ).toHaveLength(0);
  });

  it('uses default threshold count=200 when not specified', () => {
    const rules: EffectiveRule[] = [
      { type: 'NEXUS_TX_THRESHOLD', params: {}, severity: MEDIUM },
    ];
    expect(
      evaluateRulesForState({ state: 'WA', gross: 0, tx: 200 }, rules)
    ).toHaveLength(1);
    expect(
      evaluateRulesForState({ state: 'WA', gross: 0, tx: 199 }, rules)
    ).toHaveLength(0);
  });

  it('ignores EXPENSE_CAT rule type (different engine)', () => {
    const rules: EffectiveRule[] = [
      { type: 'EXPENSE_CAT', params: { category: 'Marketing', max: 10_000 }, severity: MEDIUM },
    ];
    expect(
      evaluateRulesForState({ state: 'CA', gross: 1_000_000, tx: 5_000 }, rules)
    ).toHaveLength(0);
  });

  it('reason text includes state and threshold', () => {
    const result = evaluateRulesForState(
      { state: 'NV', gross: 100_500, tx: 0 },
      wayfairDefaults
    );
    expect(result[0].reason).toContain('NV');
    expect(result[0].reason).toContain('100');
    expect(result[0].reason).toContain('threshold');
  });
});
