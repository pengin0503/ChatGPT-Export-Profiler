// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scaled performance verification', () => {
  it('keeps PR CI at 1k while release and scheduled verification exercise larger synthetic exports', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(ci).toContain('npm run make:fixture:1k');
    expect(release).toContain('npm run make:fixture:10k');
    expect(release).toContain('PERF_FIXTURE=tests/fixtures/generated-10k.zip');

    expect(existsSync('.github/workflows/performance-scale.yml')).toBe(true);
    const scaled = readFileSync('.github/workflows/performance-scale.yml', 'utf8');
    expect(scaled).toContain('schedule:');
    expect(scaled).toContain('10000');
    expect(scaled).toContain('50000');
  });
});
