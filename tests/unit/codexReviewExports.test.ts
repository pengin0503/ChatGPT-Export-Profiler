// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exportCsv } from '../../src/features/export-results/exportCsv';
import { exportMarkdown } from '../../src/features/export-results/exportMarkdown';
import type { AnalyticsExport } from '../../src/features/export-results/exportJson';

const htmlPayload = '<img src=x onerror=alert(1)>';
const markdownLinkPayload = '[open](javascript:alert(1))';

function maliciousFixture(): AnalyticsExport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-26T00:00:00.000Z',
    overview: {
      conversations: 3,
      messages: 3,
      visibleTokens: 3,
      peakDay: null,
      largestConversationTitle: '\t=1+1',
    },
    models: [
      {
        modelId: markdownLinkPayload,
        visibleTokens: 3,
        inputTokens: 3,
        outputTokens: 0,
        messages: 3,
        conversations: 3,
        rawAliases: [htmlPayload],
      },
    ],
    conversations: [
      { title: '\t=1+1', visibleTokens: 1, messages: 1, modelIds: ['gpt-6-sol'] },
      { title: htmlPayload, visibleTokens: 1, messages: 1, modelIds: ['gpt-6-sol'] },
      { title: markdownLinkPayload, visibleTokens: 1, messages: 1, modelIds: ['gpt-6-sol'] },
    ],
  };
}

describe('Codex review export hardening regressions', () => {
  it('neutralizes spreadsheet formulas even after spreadsheet-trimmed control characters', () => {
    const csv = exportCsv(maliciousFixture());
    expect(csv).toContain("'\t=1+1");
  });

  it('escapes active HTML and Markdown link syntax in attacker-controlled cells', () => {
    const markdown = exportMarkdown(maliciousFixture());
    expect(markdown).not.toContain(htmlPayload);
    expect(markdown).not.toContain(markdownLinkPayload);
    expect(markdown).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markdown).toContain('\\[open\\](javascript:alert(1))');
  });
});
