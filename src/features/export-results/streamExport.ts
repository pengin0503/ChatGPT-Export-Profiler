import { forEachConversationMetric } from '../../storage/analyticsQueries';
import { csvRow, exportCsv } from './exportCsv';
import {
  sanitizeAnalyticsExport,
  sanitizeAnalyticsExportConversation,
  type AnalyticsExport,
  type AnalyticsExportConversation,
  type AnalyticsExportPrivacyOptions
} from './exportJson';
import { ANALYTICS_MARKDOWN_FOOTER, exportMarkdown, markdownCell } from './exportMarkdown';

export type StreamExportFormat = 'json' | 'csv' | 'md';

const CHUNK_TARGET = 256 * 1024;

function conversationDto(row: {
  title: string;
  visibleTokens: number;
  messages: number;
  modelIds: string[];
}): AnalyticsExportConversation {
  return {
    title: row.title,
    visibleTokens: row.visibleTokens,
    messages: row.messages,
    modelIds: [...row.modelIds]
  };
}

function chunkWriter(parts: BlobPart[]) {
  let buffer = '';
  return {
    append(text: string) {
      buffer += text;
      if (buffer.length >= CHUNK_TARGET) {
        parts.push(buffer);
        buffer = '';
      }
    },
    flush() {
      if (buffer) parts.push(buffer);
      buffer = '';
    }
  };
}

async function jsonBlob(
  base: AnalyticsExport,
  analysisId: string,
  options: AnalyticsExportPrivacyOptions
): Promise<Blob> {
  const sanitized = sanitizeAnalyticsExport({ ...base, conversations: [] }, options);
  const { conversations: _conversations, ...header } = sanitized;
  const serializedHeader = JSON.stringify(header, null, 2);
  const closingIndex = serializedHeader.lastIndexOf('\n}');
  const parts: BlobPart[] = [];
  const writer = chunkWriter(parts);
  writer.append(`${serializedHeader.slice(0, closingIndex)},\n  "conversations": [`);
  let first = true;
  await forEachConversationMetric(analysisId, (row) => {
    const conversation = sanitizeAnalyticsExportConversation(conversationDto(row), options);
    writer.append(`${first ? '\n' : ',\n'}    ${JSON.stringify(conversation)}`);
    first = false;
  });
  writer.append(`${first ? '' : '\n'}  ]\n}\n`);
  writer.flush();
  return new Blob(parts, { type: 'application/json;charset=utf-8' });
}

async function csvBlob(
  base: AnalyticsExport,
  analysisId: string,
  options: AnalyticsExportPrivacyOptions
): Promise<Blob> {
  const parts: BlobPart[] = [];
  const writer = chunkWriter(parts);
  writer.append(exportCsv({ ...base, conversations: [] }, options));
  await forEachConversationMetric(analysisId, (row) => {
    const conversation = sanitizeAnalyticsExportConversation(conversationDto(row), options);
    writer.append(`${csvRow([
      'conversation',
      conversation.title ?? '',
      conversation.visibleTokens,
      'calculated',
      `messages=${conversation.messages}; models=${conversation.modelIds.join(' | ')}`
    ])}\r\n`);
  });
  writer.flush();
  return new Blob(parts, { type: 'text/csv;charset=utf-8' });
}

async function markdownBlob(
  base: AnalyticsExport,
  analysisId: string,
  options: AnalyticsExportPrivacyOptions
): Promise<Blob> {
  const summary = exportMarkdown({ ...base, conversations: [] }, options);
  const footerIndex = summary.lastIndexOf(ANALYTICS_MARKDOWN_FOOTER);
  const prefix = footerIndex >= 0 ? summary.slice(0, footerIndex).trimEnd() : summary.trimEnd();
  const parts: BlobPart[] = [];
  const writer = chunkWriter(parts);
  writer.append(`${prefix}\n\n## Conversations\n\n`);
  if (options.includeConversationTitles) {
    writer.append('| Title | Visible tokens | Messages | Models |\n| --- | ---: | ---: | --- |\n');
  } else {
    writer.append('| Visible tokens | Messages | Models |\n| ---: | ---: | --- |\n');
  }
  await forEachConversationMetric(analysisId, (row) => {
    const conversation = sanitizeAnalyticsExportConversation(conversationDto(row), options);
    if (options.includeConversationTitles) {
      writer.append(`| ${markdownCell(conversation.title ?? '')} | ${conversation.visibleTokens} | ${conversation.messages} | ${markdownCell(conversation.modelIds.join(', '))} |\n`);
    } else {
      writer.append(`| ${conversation.visibleTokens} | ${conversation.messages} | ${markdownCell(conversation.modelIds.join(', '))} |\n`);
    }
  });
  writer.append(`\n${ANALYTICS_MARKDOWN_FOOTER}\n`);
  writer.flush();
  return new Blob(parts, { type: 'text/markdown;charset=utf-8' });
}

export async function buildStreamingAnalyticsBlob(
  base: AnalyticsExport,
  analysisId: string,
  format: StreamExportFormat,
  options: AnalyticsExportPrivacyOptions = {}
): Promise<Blob> {
  if (format === 'json') return jsonBlob(base, analysisId, options);
  if (format === 'csv') return csvBlob(base, analysisId, options);
  return markdownBlob(base, analysisId, options);
}
