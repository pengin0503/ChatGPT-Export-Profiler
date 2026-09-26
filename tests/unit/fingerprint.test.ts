import { describe, expect, it } from 'vitest';
import { fingerprintImport } from '../../src/analysis/fingerprint';
import type { ZipInspection } from '../../src/import/zipInspector';

const baseInspection: ZipInspection = {
  ok: true,
  entryCount: 2,
  conversationEntry: {
    filename: 'conversations.json',
    compressedSize: 128,
    uncompressedSize: 512
  },
  blockingIssues: []
};

function syntheticFile(text: string, lastModified = 1_790_000_000_000): Blob & { lastModified: number } {
  const blob = new Blob([text], { type: 'application/zip' }) as Blob & { lastModified: number };
  Object.defineProperty(blob, 'lastModified', { value: lastModified, enumerable: true });
  return blob;
}

describe('fingerprintImport', () => {
  it('is stable for identical bytes and relevant metadata', async () => {
    const first = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    const second = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    expect(second).toEqual(first);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when source content changes', async () => {
    const first = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    const second = await fingerprintImport(syntheticFile('synthetic-export-b'), baseInspection);
    expect(second.hash).not.toBe(first.hash);
  });

  it('changes when relevant conversations entry metadata changes', async () => {
    const first = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    const second = await fingerprintImport(syntheticFile('synthetic-export-a'), {
      ...baseInspection,
      conversationEntry: { ...baseInspection.conversationEntry!, uncompressedSize: 513 }
    });
    expect(second.hash).not.toBe(first.hash);
  });
});
