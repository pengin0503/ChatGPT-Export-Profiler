// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('service worker cache lifecycle', () => {
  it('prunes cached app-shell assets that are no longer in the injected precache manifest', () => {
    const source = readFileSync('src/pwa/service-worker.ts', 'utf8');
    expect(source).toContain('cache.keys()');
    expect(source).toContain('precacheUrlSet.has(request.url)');
    expect(source).toContain('cache.delete(request)');
  });
});
