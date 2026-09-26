import {
  sanitizeAnalyticsExport,
  type AnalyticsExport,
  type AnalyticsExportPrivacyOptions
} from './exportJson';

function startsWithFormulaAfterIgnoredPrefix(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) {
      index += 1;
      continue;
    }
    break;
  }
  const first = text[index];
  return first === '=' || first === '+' || first === '-' || first === '@';
}

export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (startsWithFormulaAfterIgnoredPrefix(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(',');
}

export function exportCsv(value: AnalyticsExport, options: AnalyticsExportPrivacyOptions = {}): string {
  const data = sanitizeAnalyticsExport(value, options);
  const rows: string[] = [csvRow(['section', 'name', 'value', 'provenance', 'detail'])];

  rows.push(csvRow(['overview', 'conversations', data.overview.conversations, 'observed', '']));
  rows.push(csvRow(['overview', 'messages', data.overview.messages, 'observed', '']));
  rows.push(csvRow(['overview', 'visible tokens', data.overview.visibleTokens, 'calculated', '']));
  rows.push(csvRow(['overview', 'peak day', data.overview.peakDay, 'calculated', '']));
  rows.push(csvRow(['overview', 'largest conversation', data.overview.largestConversationTitle, 'calculated', '']));

  for (const model of data.models) {
    rows.push(csvRow([
      'model',
      model.modelId,
      model.visibleTokens,
      'calculated',
      `input=${model.inputTokens}; output=${model.outputTokens}; messages=${model.messages}; conversations=${model.conversations}; aliases=${model.rawAliases.join(' | ')}`
    ]));
  }

  for (const conversation of data.conversations) {
    rows.push(csvRow([
      'conversation',
      conversation.title ?? '',
      conversation.visibleTokens,
      'calculated',
      `messages=${conversation.messages}; models=${conversation.modelIds.join(' | ')}`
    ]));
  }

  if (data.cost?.visibleApiEquivalentUsd !== undefined) {
    rows.push(csvRow([
      'cost',
      'visible API-equivalent USD',
      data.cost.visibleApiEquivalentUsd,
      data.cost.visibleProvenance ?? 'calculated',
      ''
    ]));
  }
  if (data.cost?.scenario) {
    const scenario = data.cost.scenario;
    rows.push(csvRow([
      'cost',
      'scenario USD range',
      `${scenario.lowerUsd}-${scenario.upperUsd}`,
      scenario.provenance,
      `model=${scenario.modelId}; cacheRatio=${scenario.assumptions.cacheRatio}; hiddenInputOverheadRatio=${scenario.assumptions.hiddenInputOverheadRatio}; reasoningOutputOverheadRatio=${scenario.assumptions.reasoningOutputOverheadRatio}`
    ]));
  }

  for (const price of data.cost?.pricing ?? []) {
    rows.push(csvRow([
      'pricing',
      price.modelId,
      `${price.inputPerMillion}/${price.cachedInputPerMillion}/${price.outputPerMillion} USD per million`,
      'observed pricing assumption',
      `effectiveFrom=${price.effectiveFrom}; source=${price.source ?? 'local override'}`
    ]));
  }
  for (const gap of data.cost?.coverageGaps ?? []) {
    rows.push(csvRow(['cost', 'pricing coverage gap', '', 'incomplete', gap]));
  }

  return `${rows.join('\r\n')}\r\n`;
}
