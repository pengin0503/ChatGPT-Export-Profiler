import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { exportJson, type AnalyticsExport } from '../../src/features/export-results/exportJson';
import { exportCsv } from '../../src/features/export-results/exportCsv';
import { exportMarkdown } from '../../src/features/export-results/exportMarkdown';
import { buildAnalyticsExport } from '../../src/features/export-results/ExportResultsButton';
import { openProfilerDb, PROFILER_DB_NAME } from '../../src/storage/db';

const RAW_BODY_SENTINEL = 'RAW_BODY_SENTINEL_MUST_NEVER_EXPORT';


async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(resetDb);

function fixture(): AnalyticsExport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-25T08:45:00.000Z',
    overview: {
      conversations: 4,
      messages: 8,
      visibleTokens: 1234,
      peakDay: '2026-09-24',
      largestConversationTitle: '=SUM(A1:A2) | synthetic\nline'
    },
    models: [
      {
        modelId: 'gpt-6-sol',
        visibleTokens: 1234,
        inputTokens: 500,
        outputTokens: 734,
        messages: 8,
        conversations: 4,
        rawAliases: ['gpt-6-sol']
      }
    ],
    conversations: [
      { title: '=SUM(A1:A2) | synthetic\nline', visibleTokens: 600, messages: 2, modelIds: ['gpt-6-sol'] },
      { title: '+formula', visibleTokens: 300, messages: 2, modelIds: ['gpt-6-sol'] },
      { title: '-formula', visibleTokens: 200, messages: 2, modelIds: ['gpt-6-sol'] },
      { title: '@formula', visibleTokens: 134, messages: 2, modelIds: ['gpt-6-sol'] }
    ],
    cost: {
      visibleApiEquivalentUsd: 0.0123,
      visibleProvenance: 'calculated',
      scenario: {
        lowerUsd: 0.01,
        upperUsd: 0.02,
        provenance: 'estimated',
        modelId: 'gpt-6-sol',
        assumptions: {
          cacheRatio: 0.25,
          hiddenInputOverheadRatio: 0.2,
          reasoningOutputOverheadRatio: 0.3
        }
      }
    }
  };
}

describe('privacy-safe analytics export', () => {
  it('serializes only the analytics DTO and never leaks extra raw body fields', () => {
    const value = { ...fixture(), rawBody: RAW_BODY_SENTINEL, messageText: RAW_BODY_SENTINEL } as unknown as AnalyticsExport;
    const outputs = [exportJson(value), exportCsv(value), exportMarkdown(value)];

    for (const output of outputs) {
      expect(output).toContain('synthetic');
      expect(output).not.toContain(RAW_BODY_SENTINEL);
    }

    const parsed = JSON.parse(outputs[0]) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('rawBody');
    expect(parsed).not.toHaveProperty('messageText');
  });

  it('neutralizes spreadsheet formulas and escapes Markdown table content', () => {
    const csv = exportCsv(fixture());
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain("'+formula");
    expect(csv).toContain("'-formula");
    expect(csv).toContain("'@formula");

    const markdown = exportMarkdown(fixture());
    expect(markdown).toContain('=SUM(A1:A2) \\| synthetic<br>line');
    expect(markdown).toContain('calculated');
    expect(markdown).toContain('estimated');
    expect(markdown).toContain('cacheRatio: 0.25');
    expect(markdown).toContain('hiddenInputOverheadRatio: 0.2');
    expect(markdown).toContain('reasoningOutputOverheadRatio: 0.3');
  });

  it('includes persisted visible pricing and scenario assumptions in the downloadable report', async () => {
    const analysisId = 'analysis-export-cost';
    const db = await openProfilerDb();
    const tx = db.transaction(['conversationMetrics', 'modelMetrics', 'costProfiles'], 'readwrite');
    await tx.objectStore('conversationMetrics').put({
      analysisId,
      conversationId: 'synthetic-cost-conversation',
      title: 'Synthetic cost report',
      firstTimestamp: Date.parse('2026-09-24T00:00:00Z') / 1000,
      lastTimestamp: Date.parse('2026-09-24T00:01:00Z') / 1000,
      messages: 1,
      visibleTokens: 1_000_000,
      inputTokens: 1_000_000,
      outputTokens: 0,
      otherTokens: 0,
      modelIds: ['gpt-6-sol'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false
    });
    await tx.objectStore('modelMetrics').put({
      analysisId,
      localKey: '1:gpt-6-sol',
      value: {
        modelId: 'gpt-6-sol',
        messages: 1,
        conversations: 1,
        visibleTokens: 1_000_000,
        inputTokens: 1_000_000,
        outputTokens: 0,
        otherTokens: 0,
        rawAliases: ['gpt-6-sol'],
        usageByDay: { '2026-09-24': { inputTokens: 1_000_000, outputTokens: 0 } }
      }
    });
    await tx.objectStore('costProfiles').put({
      key: `scenario:${analysisId}`,
      value: {
        lower: 1,
        upper: 2,
        request: {
          replacementModelId: 'gpt-6-sol',
          assumptions: {
            cacheRatio: 0.25,
            hiddenInputOverheadRatio: 0.2,
            reasoningOutputOverheadRatio: 0.3
          }
        },
        provenance: 'estimated'
      }
    });
    await tx.done;
    db.close();

    const report = await buildAnalyticsExport(analysisId);
    const markdown = exportMarkdown(report);

    expect(report.cost?.visibleApiEquivalentUsd).toBeCloseTo(2);
    expect(report.cost?.scenario?.lowerUsd).toBe(1);
    expect(markdown).toContain('Visible API-equivalent cost: $2');
    expect(markdown).toContain('Scenario: $1–$2');
    expect(markdown).toContain('cacheRatio: 0.25');
    expect(markdown).toContain('hiddenInputOverheadRatio: 0.2');
    expect(markdown).toContain('reasoningOutputOverheadRatio: 0.3');
  });
});
