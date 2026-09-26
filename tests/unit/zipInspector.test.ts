// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_ZIP_SAFETY, inspectExportZip } from '../../src/import/zipInspector';
import { makeZip } from '../helpers/makeZip';

describe('inspectExportZip', () => {
  it('accepts a normal synthetic export', async () => {
    const file = await makeZip([
      { name: 'conversations.json', text: JSON.stringify([{ id: 'synthetic-1', mapping: {} }]) },
      { name: 'user.json', text: '{}' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(true);
    expect(result.conversationEntry?.filename).toBe('conversations.json');
    expect(result.blockingIssues).toEqual([]);
  });

  it('accepts a synthetic sharded conversations export', async () => {
    const file = await makeZip([
      { name: 'conversations-001.json', text: JSON.stringify([{ id: 'synthetic-1', mapping: {} }]) },
      { name: 'conversations-002.json', text: JSON.stringify([{ id: 'synthetic-2', mapping: {} }]) },
      { name: 'export_manifest.json', text: JSON.stringify({ logical_files: { 'conversations.json': { sharded: true, shard_count: 2, files: ['conversations-001.json', 'conversations-002.json'] } } }) }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('blocks a synthetic sharded export with a missing shard index', async () => {
    const file = await makeZip([
      { name: 'conversations-001.json', text: '[]' },
      { name: 'conversations-003.json', text: '[]' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('INCOMPLETE_CONVERSATION_SHARDS');
  });

  it('blocks a manifest whose declared conversation shards do not match the archive', async () => {
    const file = await makeZip([
      { name: 'conversations-001.json', text: '[]' },
      { name: 'conversations-002.json', text: '[]' },
      { name: 'export_manifest.json', text: JSON.stringify({ logical_files: { 'conversations.json': { sharded: true, shard_count: 2, files: ['conversations-001.json', 'conversations-003.json'] } } }) }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('MANIFEST_SHARD_MISMATCH');
  });

  it('blocks mixed monolithic and sharded conversation payloads as ambiguous', async () => {
    const file = await makeZip([
      { name: 'conversations.json', text: '[]' },
      { name: 'conversations-001.json', text: '[]' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('DUPLICATE_CONVERSATIONS');
  });

  it('applies the conversation byte limit to the sum of shard sizes', async () => {
    const file = await makeZip([
      { name: 'conversations-001.json', text: '[{"synthetic":"payload-a"}]' },
      { name: 'conversations-002.json', text: '[{"synthetic":"payload-b"}]' }
    ]);
    const result = await inspectExportZip(file, { ...DEFAULT_ZIP_SAFETY, maxConversationBytes: 16 });
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('CONVERSATIONS_TOO_LARGE');
  });

  it('blocks a zip missing conversations.json', async () => {
    const result = await inspectExportZip(await makeZip([{ name: 'user.json', text: '{}' }]));
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('MISSING_CONVERSATIONS');
  });

  it('blocks duplicate conversations.json entries', async () => {
    const file = await makeZip([
      { name: 'conversations.json', text: '[]' },
      { name: 'conversations.json', text: '[]' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('DUPLICATE_CONVERSATIONS');
  });

  it('blocks path traversal entry names', async () => {
    const file = await makeZip([
      { name: 'conversations.json', text: '[]' },
      { name: '../conversations.json', text: '[]' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('UNSAFE_ENTRY_PATH');
  });

  it('blocks a conversations entry over the configured size policy', async () => {
    const file = await makeZip([{ name: 'conversations.json', text: '[{"synthetic":"payload"}]' }]);
    const result = await inspectExportZip(file, { ...DEFAULT_ZIP_SAFETY, maxConversationBytes: 8 });
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('CONVERSATIONS_TOO_LARGE');
  });

  it('blocks a suspicious compression ratio', async () => {
    const payload = JSON.stringify([{ id: 'synthetic', text: 'A'.repeat(1_000_000) }]);
    const file = await makeZip([{ name: 'conversations.json', text: payload, level: 9 }]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('SUSPICIOUS_COMPRESSION_RATIO');
  });
});
