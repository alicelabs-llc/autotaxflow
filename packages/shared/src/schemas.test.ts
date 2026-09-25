import { describe, it, expect } from 'vitest';
import {
  CreateOrgBody,
  LoginBody,
  RegisterBody,
  GetRevenueByStateQuery,
  RequestReportBody,
  CreateRuleBody,
} from './schemas';

describe('CreateOrgBody', () => {
  it('accepts a valid org', () => {
    const result = CreateOrgBody.parse({
      name: 'Acme Inc',
      country: 'US',
    });
    expect(result.baseCurrency).toBe('USD');
  });

  it('rejects name shorter than 2 chars', () => {
    expect(() => CreateOrgBody.parse({ name: 'A', country: 'US' })).toThrow();
  });

  it('rejects country that is not 2 letters', () => {
    expect(() => CreateOrgBody.parse({ name: 'Acme', country: 'USA' })).toThrow();
  });
});

describe('LoginBody', () => {
  it('accepts valid login', () => {
    expect(() => LoginBody.parse({ email: 'a@b.com', password: 'password123' })).not.toThrow();
  });
  it('rejects invalid email', () => {
    expect(() => LoginBody.parse({ email: 'not-email', password: 'password123' })).toThrow();
  });
  it('rejects short password', () => {
    expect(() => LoginBody.parse({ email: 'a@b.com', password: 'short' })).toThrow();
  });
});

describe('RegisterBody', () => {
  it('accepts valid register without name', () => {
    const r = RegisterBody.parse({ email: 'a@b.com', password: 'password123' });
    expect(r.name).toBeUndefined();
  });
});

describe('GetRevenueByStateQuery', () => {
  it('coerces string year to number', () => {
    const r = GetRevenueByStateQuery.parse({ year: '2024' });
    expect(r.year).toBe(2024);
    expect(r.month).toBeUndefined();
  });

  it('rejects year before 2020', () => {
    expect(() => GetRevenueByStateQuery.parse({ year: '2019' })).toThrow();
  });
});

describe('RequestReportBody', () => {
  it('accepts valid report request', () => {
    const r = RequestReportBody.parse({
      type: 'MONTHLY_SUMMARY',
      periodStart: '2024-01-01T00:00:00.000Z',
      periodEnd: '2024-01-31T23:59:59.000Z',
    });
    expect(r.type).toBe('MONTHLY_SUMMARY');
  });
  it('rejects invalid report type', () => {
    expect(() =>
      RequestReportBody.parse({
        type: 'INVALID',
        periodStart: '2024-01-01T00:00:00.000Z',
        periodEnd: '2024-01-31T23:59:59.000Z',
      })
    ).toThrow();
  });
});

describe('CreateRuleBody', () => {
  it('accepts a valid nexus threshold rule', () => {
    const r = CreateRuleBody.parse({
      rulesetId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'NEXUS_REVENUE_THRESHOLD',
      params: { state: 'CA', amount: 500000 },
    });
    expect(r.severity).toBe('MEDIUM');
    expect(r.isActive).toBe(true);
  });
  it('rejects invalid rulesetId (not UUID)', () => {
    expect(() =>
      CreateRuleBody.parse({
        rulesetId: 'not-a-uuid',
        type: 'NEXUS_REVENUE_THRESHOLD',
        params: {},
      })
    ).toThrow();
  });
});
