import { describe, expect, it } from 'vitest';
import { exportJson, type AnalyticsExport } from '../../src/features/export-results/exportJson';
import { exportCsv } from '../../src/features/export-results/exportCsv';
import { exportMarkdown } from '../../src/features/export-results/exportMarkdown';

const RAW_BODY_SENTINEL = 'RAW_BODY_SENTINEL_MUST_NEVER_EXPORT';

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
});
