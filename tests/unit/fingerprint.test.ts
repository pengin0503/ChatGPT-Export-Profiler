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
  conversationEntries: [
    {
      filename: 'conversations.json',
      compressedSize: 128,
      uncompressedSize: 512
    }
  ],
  blockingIssues: []
};

function syntheticFile(text: string, lastModified = 1_790_000_000_000): Blob & { lastModified: number } {
  const blob = new Blob([text], { type: 'application/zip' }) as Blob & { lastModified: number };
  Object.defineProperty(blob, 'lastModified', { value: lastModified, enumerable: true });
  return blob;
}

describe('fingerprintImport', () => {
  it('stops fingerprinting after cancellation', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(fingerprintImport(syntheticFile('synthetic'), baseInspection, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('is stable for identical bytes and relevant metadata', async () => {
    const first = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    const second = await fingerprintImport(syntheticFile('synthetic-export-a'), baseInspection);
    expect(second).toEqual(first);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps content identity stable when only lastModified changes while retaining a legacy recovery hash', async () => {
    const first = await fingerprintImport(syntheticFile('synthetic-export-a', 1_790_000_000_000), baseInspection);
    const copied = await fingerprintImport(syntheticFile('synthetic-export-a', 1_790_000_123_456), baseInspection);

    expect(copied.hash).toBe(first.hash);
    expect(copied.legacyHash).toBeDefined();
    expect(first.legacyHash).toBeDefined();
    expect(copied.legacyHash).not.toBe(first.legacyHash);
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
      conversationEntry: { ...baseInspection.conversationEntry!, uncompressedSize: 513 },
      conversationEntries: [{ ...baseInspection.conversationEntries![0], uncompressedSize: 513 }]
    });
    expect(second.hash).not.toBe(first.hash);
  });

  it('changes when sharded conversation entry metadata changes', async () => {
    const sharded: ZipInspection = {
      ok: true,
      entryCount: 3,
      conversationEntries: [
        { filename: 'conversations-001.json', compressedSize: 100, uncompressedSize: 400 },
        { filename: 'conversations-002.json', compressedSize: 120, uncompressedSize: 480 }
      ],
      blockingIssues: []
    };
    const first = await fingerprintImport(syntheticFile('synthetic-export-a'), sharded);
    const second = await fingerprintImport(syntheticFile('synthetic-export-a'), {
      ...sharded,
      conversationEntries: [
        sharded.conversationEntries![0],
        { ...sharded.conversationEntries![1], uncompressedSize: 481 }
      ]
    });

    expect(second.hash).not.toBe(first.hash);
  });
});
