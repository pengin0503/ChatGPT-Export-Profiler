import { describe, expect, it } from 'vitest';
import { QualityCollector } from '../../src/analysis/quality';

describe('QualityCollector', () => {
  it('tracks issue severities and unknown schema keys', () => {
    const quality = new QualityCollector();
    quality.addFatal('fatal-synthetic');
    quality.addRecoverable('recoverable-synthetic');
    quality.addWarning('warning-synthetic');
    quality.addUnknownSchema('future_key');
    const snapshot = quality.snapshot();
    expect(snapshot.fatal).toBe(1);
    expect(snapshot.recoverable).toBe(1);
    expect(snapshot.warning).toBe(1);
    expect(snapshot.unknownSchema).toBe(1);
    expect(snapshot.unknownSchemaKeys).toEqual(['future_key']);
  });

  it('computes coverage from actual attempted denominators', () => {
    const quality = new QualityCollector();
    quality.recordModelIdentification(true);
    quality.recordModelIdentification(false);
    quality.recordTokenization(true);
    quality.recordTokenization(true);
    quality.recordTokenization(false);
    const coverage = quality.snapshot().coverage;
    expect(coverage.modelIdentification).toEqual({ attempted: 2, identified: 1, ratio: 0.5 });
    expect(coverage.tokenization).toEqual({ attempted: 3, identified: 2, ratio: 2 / 3 });
  });

  it('uses null coverage when nothing was attempted', () => {
    const coverage = new QualityCollector().snapshot().coverage;
    expect(coverage.modelIdentification.ratio).toBeNull();
    expect(coverage.tokenization.ratio).toBeNull();
  });

  it('keeps occurrence counters exact while deduplicating repeated issue details', () => {
    const quality = new QualityCollector();
    for (let index = 0; index < 1_000; index += 1) quality.addUnknownSchema('repeated_future_key');

    const snapshot = quality.snapshot();
    expect(snapshot.unknownSchema).toBe(1_000);
    expect(snapshot.unknownSchemaKeys).toEqual(['repeated_future_key']);
    expect(snapshot.issues.filter((issue) => issue.code === 'repeated_future_key')).toHaveLength(1);
  });

  it('bounds distinct issue and unknown-key detail arrays', () => {
    const quality = new QualityCollector();
    for (let index = 0; index < 500; index += 1) {
      quality.addWarning(`warning-${index}`);
      quality.addUnknownSchema(`future-key-${index}`);
    }

    const snapshot = quality.snapshot();
    expect(snapshot.warning).toBe(500);
    expect(snapshot.unknownSchema).toBe(500);
    expect(snapshot.issues.length).toBeLessThanOrEqual(200);
    expect(snapshot.unknownSchemaKeys.length).toBeLessThanOrEqual(200);
  });
});
