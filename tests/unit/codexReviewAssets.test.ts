// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Codex review installability and responsive layout regressions', () => {
  it('declares installable 192px and 512px application icons that exist in public assets', () => {
    const manifestPath = join(process.cwd(), 'public', 'manifest.webmanifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      icons?: Array<{ src: string; sizes?: string; type?: string }>;
    };
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' })
    ]));
    for (const icon of manifest.icons ?? []) {
      const relative = icon.src.replace(/^\.\//, '');
      expect(existsSync(join(process.cwd(), 'public', relative))).toBe(true);
    }
  });

  it('lets narrow conversation tables scroll horizontally from the outer shell', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'analytics.css'), 'utf8');
    expect(css).toMatch(/\.conversation-table-shell\{[^}]*overflow:auto/);
  });
});
