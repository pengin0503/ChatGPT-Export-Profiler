import {
  sanitizeAnalyticsExport,
  type AnalyticsExport,
  type AnalyticsExportPrivacyOptions
} from './exportJson';

export function markdownCell(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

export function exportMarkdown(value: AnalyticsExport, options: AnalyticsExportPrivacyOptions = {}): string {
  const data = sanitizeAnalyticsExport(value, options);
  const lines: string[] = [
    '# ChatGPT Export Profiler analytics report',
    '',
    `Generated: ${data.generatedAt}`,
    '',
    '## Overview',
    '',
    '| Metric | Value | Provenance |',
    '| --- | ---: | --- |',
    `| Conversations | ${data.overview.conversations} | observed |`,
    `| Messages | ${data.overview.messages} | observed |`,
    `| Visible tokens | ${data.overview.visibleTokens} | calculated |`,
    `| Peak day | ${markdownCell(data.overview.peakDay)} | calculated |`,
    `| Largest conversation | ${markdownCell(data.overview.largestConversationTitle)} | calculated |`,
    '',
    '## Models',
    '',
    '| Model | Visible tokens | Input | Output | Messages | Conversations | Raw aliases |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
  ];

  for (const model of data.models) {
    lines.push(`| ${markdownCell(model.modelId)} | ${model.visibleTokens} | ${model.inputTokens} | ${model.outputTokens} | ${model.messages} | ${model.conversations} | ${markdownCell(model.rawAliases.join(', '))} |`);
  }

  lines.push('', '## Conversations', '', '| Title | Visible tokens | Messages | Models |', '| --- | ---: | ---: | --- |');
  for (const conversation of data.conversations) {
    lines.push(`| ${markdownCell(conversation.title ?? '')} | ${conversation.visibleTokens} | ${conversation.messages} | ${markdownCell(conversation.modelIds.join(', '))} |`);
  }

  if (data.cost) {
    lines.push('', '## Cost and scenarios', '');
    if (data.cost.visibleApiEquivalentUsd !== undefined) {
      lines.push(`- Visible API-equivalent cost: $${data.cost.visibleApiEquivalentUsd} (${data.cost.visibleProvenance ?? 'calculated'})`);
    }
    if (data.cost.scenario) {
      const scenario = data.cost.scenario;
      lines.push(
        `- Scenario: $${scenario.lowerUsd}–$${scenario.upperUsd} (${scenario.provenance})`,
        `- Model: ${markdownCell(scenario.modelId)}`,
        `- Assumptions: cacheRatio: ${scenario.assumptions.cacheRatio}; hiddenInputOverheadRatio: ${scenario.assumptions.hiddenInputOverheadRatio}; reasoningOutputOverheadRatio: ${scenario.assumptions.reasoningOutputOverheadRatio}`
      );
    }
    if (data.cost.pricing?.length) {
      lines.push(
        '',
        '### Pricing used (USD per million tokens)',
        '',
        '| Model | Effective from | Input | Cached input | Output | Source |',
        '| --- | --- | ---: | ---: | ---: | --- |'
      );
      for (const price of data.cost.pricing) {
        lines.push(`| ${markdownCell(price.modelId)} | ${markdownCell(price.effectiveFrom)} | ${price.inputPerMillion} | ${price.cachedInputPerMillion} | ${price.outputPerMillion} | ${markdownCell(price.source)} |`);
      }
    }
    if (data.cost.coverageGaps?.length) {
      lines.push('', '### Pricing coverage gaps', '');
      for (const gap of data.cost.coverageGaps) lines.push(`- ${markdownCell(gap)}`);
    }
  }

  lines.push('', '> Export contains analytics read models only; raw conversation bodies are excluded by construction.', '');
  return lines.join('\n');
}
