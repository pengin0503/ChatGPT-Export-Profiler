// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openProfilerDb, PROFILER_DB_NAME, type ConversationMetricRecord } from '../../src/storage/db';
import { getOverviewMetrics, queryConversationMetrics } from '../../src/storage/analyticsQueries';

const ts = (iso: string) => Date.parse(iso) / 1000;

const rows: ConversationMetricRecord[] = [
  {
    analysisId: 'analysis-1',
    conversationId: 'c1',
    title: 'Synthetic alpha',
    firstTimestamp: ts('2026-01-01T10:00:00Z'),
    lastTimestamp: ts('2026-01-01T10:10:00Z'),
    messages: 2,
    visibleTokens: 100,
    inputTokens: 40,
    outputTokens: 60,
    otherTokens: 0,
    modelIds: ['gpt-5.6-sol'],
    hasWeb: true,
    hasFiles: false,
    hasTools: true
  },
  {
    analysisId: 'analysis-1',
    conversationId: 'c2',
    title: 'Synthetic beta',
    firstTimestamp: ts('2026-01-02T08:00:00Z'),
    lastTimestamp: ts('2026-01-02T08:30:00Z'),
    messages: 3,
    visibleTokens: 300,
    inputTokens: 120,
    outputTokens: 180,
    otherTokens: 0,
    modelIds: ['gpt-6-sol'],
    hasWeb: false,
    hasFiles: true,
    hasTools: true
  },
  {
    analysisId: 'analysis-1',
    conversationId: 'c3',
    title: 'Synthetic gamma',
    firstTimestamp: ts('2026-01-02T12:00:00Z'),
    lastTimestamp: ts('2026-01-02T12:20:00Z'),
    messages: 1,
    visibleTokens: 200,
    inputTokens: 70,
    outputTokens: 130,
    otherTokens: 0,
    modelIds: ['gpt-6-sol'],
    hasWeb: false,
    hasFiles: false,
    hasTools: false
  }
];

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

async function seed(): Promise<void> {
  const db = await openProfilerDb();
  const tx = db.transaction('conversationMetrics', 'readwrite');
  for (const row of rows) await tx.store.put(row);
  await tx.done;
  db.close();
}

afterEach(resetDb);

describe('analytics read model', () => {
  it('filters by date and model, sorts, and paginates without loading message bodies', async () => {
    await seed();
    const result = await queryConversationMetrics('analysis-1', {
      range: { from: ts('2026-01-02T00:00:00Z'), to: ts('2026-01-03T00:00:00Z') },
      modelId: 'gpt-6-sol',
      sort: 'visibleTokens-desc',
      offset: 1,
      limit: 1
    });

    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.conversationId)).toEqual(['c3']);
    expect(result.rows[0]).not.toHaveProperty('text');
    expect(result.rows[0]).not.toHaveProperty('messageText');
  });

  it('computes all-time overview totals, largest conversation, and peak day', async () => {
    await seed();
    const overview = await getOverviewMetrics('analysis-1');

    expect(overview.totals).toEqual({ conversations: 3, messages: 6, visibleTokens: 600 });
    expect(overview.largestConversation?.conversationId).toBe('c2');
    expect(overview.peakDay).toEqual({ key: '2026-01-02', messages: 4, conversations: 2, visibleTokens: 500 });
  });

  it('returns stable empty all-time values for an analysis with no metrics', async () => {
    const overview = await getOverviewMetrics('empty-analysis');
    const table = await queryConversationMetrics('empty-analysis', { offset: 0, limit: 50 });

    expect(overview.totals).toEqual({ conversations: 0, messages: 0, visibleTokens: 0 });
    expect(overview.peakDay).toBeNull();
    expect(overview.largestConversation).toBeNull();
    expect(table).toEqual({ total: 0, rows: [] });
  });
});
