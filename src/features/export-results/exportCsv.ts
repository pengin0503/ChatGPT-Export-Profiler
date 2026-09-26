import { sanitizeAnalyticsExport, type AnalyticsExport } from './exportJson';

function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(',');
}

export function exportCsv(value: AnalyticsExport): string {
  const data = sanitizeAnalyticsExport(value);
  const rows: string[] = [row(['section', 'name', 'value', 'provenance', 'detail'])];

  rows.push(row(['overview', 'conversations', data.overview.conversations, 'observed', '']));
  rows.push(row(['overview', 'messages', data.overview.messages, 'observed', '']));
  rows.push(row(['overview', 'visible tokens', data.overview.visibleTokens, 'calculated', '']));
  rows.push(row(['overview', 'peak day', data.overview.peakDay, 'calculated', '']));
  rows.push(row(['overview', 'largest conversation', data.overview.largestConversationTitle, 'calculated', '']));

  for (const model of data.models) {
    rows.push(row([
      'model',
      model.modelId,
      model.visibleTokens,
      'calculated',
      `input=${model.inputTokens}; output=${model.outputTokens}; messages=${model.messages}; conversations=${model.conversations}; aliases=${model.rawAliases.join(' | ')}`
    ]));
  }

  for (const conversation of data.conversations) {
    rows.push(row([
      'conversation',
      conversation.title,
      conversation.visibleTokens,
      'calculated',
      `messages=${conversation.messages}; models=${conversation.modelIds.join(' | ')}`
    ]));
  }

  if (data.cost?.visibleApiEquivalentUsd !== undefined) {
    rows.push(row([
      'cost',
      'visible API-equivalent USD',
      data.cost.visibleApiEquivalentUsd,
      data.cost.visibleProvenance ?? 'calculated',
      ''
    ]));
  }
  if (data.cost?.scenario) {
    const scenario = data.cost.scenario;
    rows.push(row([
      'cost',
      'scenario USD range',
      `${scenario.lowerUsd}-${scenario.upperUsd}`,
      scenario.provenance,
      `model=${scenario.modelId}; cacheRatio=${scenario.assumptions.cacheRatio}; hiddenInputOverheadRatio=${scenario.assumptions.hiddenInputOverheadRatio}; reasoningOutputOverheadRatio=${scenario.assumptions.reasoningOutputOverheadRatio}`
    ]));
  }

  for (const price of data.cost?.pricing ?? []) {
    rows.push(row([
      'pricing',
      price.modelId,
      `${price.inputPerMillion}/${price.cachedInputPerMillion}/${price.outputPerMillion} USD per million`,
      'observed pricing assumption',
      `effectiveFrom=${price.effectiveFrom}; source=${price.source ?? 'local override'}`
    ]));
  }
  for (const gap of data.cost?.coverageGaps ?? []) {
    rows.push(row(['cost', 'pricing coverage gap', '', 'incomplete', gap]));
  }

  return `${rows.join('\r\n')}\r\n`;
}
