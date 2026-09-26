import { describe, expect, it } from 'vitest';
import { provenanceLabel } from '../../src/analysis/domain';

describe('provenanceLabel', () => {
  it('keeps observed, calculated, and estimated distinct', () => {
    expect(provenanceLabel('observed')).toBe('observed');
    expect(provenanceLabel('calculated')).toBe('calculated');
    expect(provenanceLabel('estimated')).toBe('estimated');
  });
});
