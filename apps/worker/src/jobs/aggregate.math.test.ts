import { describe, it, expect } from 'vitest';
import { aggregateRevenue, isNexusLikely } from './aggregate.math';

describe('aggregateRevenue', () => {
  it('sums charges to gross', () => {
    const result = aggregateRevenue(
      [{ amount: 100, type: 'CHARGE' }, { amount: 50.5, type: 'CHARGE' }],
      []
    );
    expect(result.grossRevenue).toBe(150.5);
    expect(result.netRevenue).toBe(150.5);
    expect(result.txCount).toBe(2);
  });

  it('subtracts refunds from net', () => {
    const result = aggregateRevenue(
      [{ amount: 100, type: 'CHARGE' }],
      [{ amount: 25, type: 'REFUND' }]
    );
    expect(result.grossRevenue).toBe(100);
    expect(result.netRevenue).toBe(75);
    expect(result.txCount).toBe(2);
  });

  it('handles empty input', () => {
    const result = aggregateRevenue([], []);
    expect(result).toEqual({ grossRevenue: 0, netRevenue: 0, txCount: 0 });
  });

  it('rounds to 2 decimal places', () => {
    const result = aggregateRevenue(
      [{ amount: 0.005, type: 'CHARGE' }],
      [{ amount: 0.002, type: 'REFUND' }]
    );
    // 0.005 rounds to 0.01 in JS Math.round; net = 0.01 - 0.00 = 0.01
    expect(result.grossRevenue).toBe(0.01);
  });
});

describe('isNexusLikely', () => {
  it('triggers on revenue threshold (100k)', () => {
    expect(isNexusLikely(100_000, 1)).toBe(true);
    expect(isNexusLikely(99_999.99, 199)).toBe(false);
  });

  it('triggers on tx count threshold (200)', () => {
    expect(isNexusLikely(1, 200)).toBe(true);
    expect(isNexusLikely(1, 199)).toBe(false);
  });

  it('triggers when both thresholds met', () => {
    expect(isNexusLikely(500_000, 500)).toBe(true);
  });

  it('does not trigger on zero state', () => {
    expect(isNexusLikely(0, 0)).toBe(false);
  });
});
