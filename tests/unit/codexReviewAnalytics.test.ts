// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getOverviewMetrics, queryConversationMetrics } from '../../src/storage/analyticsQueries';
import { openProfilerDb, PROFILER_DB_NAME, type ConversationMetricRecord } from '../../src/storage/db';
import { analysisRepository } from '../../src/storage/repositories';

const ts = (iso: string) => Date.parse(iso) / 1000;

type DailyConversationMetric = {
  messages: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  modelIds: string[];
};

type RangedConversationMetricRecord = ConversationMetricRecord & {
  usageByDay?: Record<string, DailyConversationMetric>;
};

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

async function putConversation(row: RangedConversationMetricRecord): Promise<void> {
  const db = await openProfilerDb();
  await db.put('conversationMetrics', row);
  db.close();
}

afterEach(resetDb);

describe('Codex review analytics regressions', () => {
  it('projects a cross-day conversation to only the selected range usage', async () => {
    await putConversation({
      analysisId: 'analysis-range',
      conversationId: 'cross-day',
      title: 'Cross-day conversation',
      firstTimestamp: ts('2026-01-01T10:00:00Z'),
      lastTimestamp: ts('2026-01-02T12:00:00Z'),
      messages: 4,
      visibleTokens: 400,
      inputTokens: 180,
      outputTokens: 220,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false,
      usageByDay: {
        '2026-01-01': { messages: 1, visibleTokens: 100, inputTokens: 40, outputTokens: 60, otherTokens: 0, modelIds: ['gpt-6-sol'] },
        '2026-01-02': { messages: 3, visibleTokens: 300, inputTokens: 140, outputTokens: 160, otherTokens: 0, modelIds: ['gpt-6-sol'] }
      }
    });

    const range = { from: ts('2026-01-02T00:00:00Z'), to: ts('2026-01-03T00:00:00Z') };
    const table = await queryConversationMetrics('analysis-range', { range, limit: 10 });
    const overview = await getOverviewMetrics('analysis-range', range);

    expect(table.total).toBe(1);
    expect(table.rows[0]).toMatchObject({ messages: 3, visibleTokens: 300, inputTokens: 140, outputTokens: 160 });
    expect(overview.totals).toEqual({ conversations: 1, messages: 3, visibleTokens: 300 });
    expect(overview.peakDay).toEqual({ key: '2026-01-02', messages: 3, conversations: 1, visibleTokens: 300 });
  });

  it('normalizes millisecond conversation timestamps before comparing second-based ranges', async () => {
    await putConversation({
      analysisId: 'analysis-ms',
      conversationId: 'milliseconds',
      title: 'Millisecond timestamps',
      firstTimestamp: Date.parse('2026-01-02T08:00:00Z'),
      lastTimestamp: Date.parse('2026-01-02T08:10:00Z'),
      messages: 1,
      visibleTokens: 10,
      inputTokens: 4,
      outputTokens: 6,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false
    });

    const result = await queryConversationMetrics('analysis-ms', {
      range: { from: ts('2026-01-02T00:00:00Z'), to: ts('2026-01-03T00:00:00Z') },
      limit: 10
    });

    expect(result.total).toBe(1);
    expect(result.rows[0]?.conversationId).toBe('milliseconds');
  });

  it('derives peak day from persisted daily usage rather than the conversation first timestamp', async () => {
    await putConversation({
      analysisId: 'analysis-peak',
      conversationId: 'peak',
      title: 'Peak day',
      firstTimestamp: ts('2026-01-01T10:00:00Z'),
      lastTimestamp: ts('2026-01-02T12:00:00Z'),
      messages: 6,
      visibleTokens: 600,
      inputTokens: 300,
      outputTokens: 300,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false,
      usageByDay: {
        '2026-01-01': { messages: 1, visibleTokens: 100, inputTokens: 50, outputTokens: 50, otherTokens: 0, modelIds: ['gpt-6-sol'] },
        '2026-01-02': { messages: 5, visibleTokens: 500, inputTokens: 250, outputTokens: 250, otherTokens: 0, modelIds: ['gpt-6-sol'] }
      }
    });

    const overview = await getOverviewMetrics('analysis-peak');
    expect(overview.peakDay?.key).toBe('2026-01-02');
    expect(overview.peakDay?.messages).toBe(5);
  });

  it('deletes analysis-scoped cost and comparison records with the analysis', async () => {
    const analysisId = 'analysis-delete';
    const db = await openProfilerDb();
    await db.put('analyses', {
      id: analysisId,
      fingerprint: 'fp',
      createdAt: 1,
      status: 'complete',
      appVersion: '0.1.0',
      schemaVersion: 1,
      analyzerVersion: 1,
      tokenizerVersion: 1,
      pricingDatasetVersion: 1
    });
    await db.put('costProfiles', { key: `scenario:${analysisId}`, value: { lower: 1, upper: 2 } });
    await db.put('settings', { key: `comparison:${analysisId}`, value: { selected: ['x'] } });
    db.close();

    await analysisRepository.delete(analysisId);

    const verify = await openProfilerDb();
    expect(await verify.get('costProfiles', `scenario:${analysisId}`)).toBeUndefined();
    expect(await verify.get('settings', `comparison:${analysisId}`)).toBeUndefined();
    verify.close();
  });
});
