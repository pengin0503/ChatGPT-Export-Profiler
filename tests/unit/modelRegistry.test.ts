import { describe, expect, it } from 'vitest';
import { resolveModel } from '../../src/analysis/modelRegistry';

describe('resolveModel', () => {
  it.each(['constructor', 'toString', '__proto__'])('preserves prototype-like model id %s as unknown', (raw) => {
    expect(resolveModel(raw)).toEqual({ canonicalId: undefined, raw, confidence: 'unknown' });
    expect(resolveModel(raw, Object.create(null))).toEqual({ canonicalId: undefined, raw, confidence: 'unknown' });
  });

  it('uses only explicit own properties of local alias overrides', () => {
    const inherited = Object.create({ 'future-model': 'gpt-6-sol' });
    expect(resolveModel('future-model', inherited).confidence).toBe('unknown');
    expect(resolveModel('__proto__', Object.fromEntries([['__proto__', 'gpt-6-sol']]))).toEqual({
      canonicalId: 'gpt-6-sol', raw: '__proto__', confidence: 'alias'
    });
  });

  it('resolves exact canonical model ids', () => {
    expect(resolveModel('gpt-6-sol')).toEqual({
      canonicalId: 'gpt-6-sol',
      raw: 'gpt-6-sol',
      confidence: 'exact'
    });
  });

  it('resolves a documented explicit alias', () => {
    expect(resolveModel('gpt-5.6')).toEqual({
      canonicalId: 'gpt-5.6-sol',
      raw: 'gpt-5.6',
      confidence: 'alias'
    });
  });

  it('uses a local alias override ahead of built-in alias and family resolution', () => {
    expect(resolveModel('gpt-5.6', { 'gpt-5.6': 'gpt-6-sol' })).toEqual({
      canonicalId: 'gpt-6-sol',
      raw: 'gpt-5.6',
      confidence: 'alias'
    });
    expect(resolveModel('gpt-6-sol-2026-09-22', { 'gpt-6-sol-2026-09-22': 'custom-model' })).toEqual({
      canonicalId: 'custom-model',
      raw: 'gpt-6-sol-2026-09-22',
      confidence: 'alias'
    });
  });

  it('keeps exact canonical model ids authoritative over a local alias entry', () => {
    expect(resolveModel('gpt-6-sol', { 'gpt-6-sol': 'custom-model' })).toEqual({
      canonicalId: 'gpt-6-sol',
      raw: 'gpt-6-sol',
      confidence: 'exact'
    });
  });

  it('resolves only conservative date-suffixed family ids', () => {
    expect(resolveModel('gpt-6-sol-2026-09-22')).toEqual({
      canonicalId: 'gpt-6-sol',
      raw: 'gpt-6-sol-2026-09-22',
      confidence: 'family'
    });
    expect(resolveModel('gpt-6-solar')).toEqual({
      canonicalId: undefined,
      raw: 'gpt-6-solar',
      confidence: 'unknown'
    });
  });

  it('preserves an unknown raw model', () => {
    expect(resolveModel('future-model-x')).toEqual({
      canonicalId: undefined,
      raw: 'future-model-x',
      confidence: 'unknown'
    });
  });
});
