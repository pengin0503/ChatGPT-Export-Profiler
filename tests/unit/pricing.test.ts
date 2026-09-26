import { describe, expect, it } from 'vitest';
import {
  calculateScenarioCost,
  calculateVisibleCost,
  findPrice,
  type PricingRecord
} from '../../src/analysis/pricing';

const record: PricingRecord = {
  model: 'example-model',
  effectiveFrom: '2026-05-01',
  effectiveTo: null,
  inputPerMillion: 2,
  cachedInputPerMillion: 0.2,
  outputPerMillion: 4,
  currency: 'USD',
  datasetVersion: 1
};

describe('findPrice', () => {
  it('uses the price effective on the message date', () => {
    const result = findPrice('example-model', Date.parse('2026-06-01'), [
      { ...record, effectiveFrom: '2026-01-01', effectiveTo: '2026-04-30', inputPerMillion: 1 },
      record
    ]);
    expect(result?.inputPerMillion).toBe(2);
  });

  it('treats a date-only effectiveTo as inclusive through that UTC day', () => {
    const old = { ...record, effectiveFrom: '2026-01-01', effectiveTo: '2026-04-30', inputPerMillion: 1 };
    expect(findPrice('example-model', Date.parse('2026-04-30T23:59:59.999Z'), [old, record])).toBe(old);
  });

  it('returns undefined for unsupported historical coverage', () => {
    expect(findPrice('example-model', Date.parse('2025-01-01'), [record])).toBeUndefined();
  });

  it('prefers a local override when its effective date matches a built-in price', () => {
    const builtIn = { ...record, source: 'built-in source' };
    const override = { ...record, inputPerMillion: 9, source: 'local user override' };

    expect(findPrice('example-model', Date.parse('2026-05-02'), [builtIn, override])).toBe(override);
  });
});

describe('cost calculations', () => {
  it('calculates visible input and output cost', () => {
    expect(calculateVisibleCost(1_000_000, 500_000, record)).toBeCloseTo(4);
  });

  it('returns a bounded scenario with the assumptions attached', () => {
    const assumptions = {
      cacheRatio: 0.5,
      hiddenInputOverheadRatio: 0.2,
      reasoningOutputOverheadRatio: 0.1
    };
    const result = calculateScenarioCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      record,
      assumptions
    );
    expect(result.lower).toBeCloseTo(5.1);
    expect(result.upper).toBeCloseTo(5.9);
    expect(result.assumptions).toEqual(assumptions);
  });

  it('rejects invalid ratios and negative token counts', () => {
    expect(() => calculateVisibleCost(-1, 0, record)).toThrow();
    expect(() => calculateScenarioCost(
      { inputTokens: 1, outputTokens: 1 },
      record,
      { cacheRatio: 1.01, hiddenInputOverheadRatio: 0, reasoningOutputOverheadRatio: 0 }
    )).toThrow();
  });
});
