import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStreamingAnalyticsBlob } from '../../src/features/export-results/streamExport';
import type { AnalyticsExport } from '../../src/features/export-results/exportJson';
import { openProfilerDb, PROFILER_DB_NAME } from '../../src/storage/db';

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(resetDb);

const base: AnalyticsExport = {
  schemaVersion: 1,
  generatedAt: '2026-09-26T00:00:00.000Z',
  overview: {
    conversations: 1,
    messages: 2,
    visibleTokens: 20,
    peakDay: '2026-09-26',
    largestConversationTitle: 'Synthetic private title'
  },
  models: [],
  conversations: []
};

describe('streaming analytics export', () => {
  it('reads conversation rows through a cursor and omits titles by default', async () => {
    const analysisId = 'stream-export';
    const db = await openProfilerDb();
    await db.put('conversationMetrics', {
      analysisId,
      conversationId: 'synthetic-conversation',
      title: 'Synthetic private title',
      messages: 2,
      visibleTokens: 20,
      inputTokens: 8,
      outputTokens: 12,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false
    });
    db.close();

    const original = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function forbiddenGetAll(): IDBRequest<unknown[]> {
      throw new Error('interactive export must not materialize all index rows');
    } as typeof IDBIndex.prototype.getAll;
    try {
      const blob = await buildStreamingAnalyticsBlob(base, analysisId, 'json');
      const text = await blob.text();
      const parsed = JSON.parse(text) as AnalyticsExport;
      expect(parsed.conversations).toEqual([{
        visibleTokens: 20,
        messages: 2,
        modelIds: ['gpt-6-sol']
      }]);
      expect(text).not.toContain('Synthetic private title');
    } finally {
      IDBIndex.prototype.getAll = original;
    }
  });

  it('includes titles only when explicitly requested', async () => {
    const analysisId = 'stream-export-titles';
    const db = await openProfilerDb();
    await db.put('conversationMetrics', {
      analysisId,
      conversationId: 'synthetic-conversation',
      title: 'Synthetic opted-in title',
      messages: 1,
      visibleTokens: 5,
      inputTokens: 5,
      outputTokens: 0,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false
    });
    db.close();

    const blob = await buildStreamingAnalyticsBlob(base, analysisId, 'json', { includeConversationTitles: true });
    expect(await blob.text()).toContain('Synthetic opted-in title');
  });
});
