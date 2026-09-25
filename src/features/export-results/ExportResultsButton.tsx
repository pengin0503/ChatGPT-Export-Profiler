import { useState } from 'react';
import { getModelMetrics, getOverviewMetrics, queryConversationMetrics } from '../../storage/analyticsQueries';
import { exportCsv } from './exportCsv';
import { exportJson, type AnalyticsExport } from './exportJson';
import { exportMarkdown } from './exportMarkdown';

interface ExportResultsButtonProps {
  analysisId: string;
}

type ExportFormat = 'json' | 'csv' | 'md';

async function allConversationRows(analysisId: string) {
  const pageSize = 500;
  const first = await queryConversationMetrics(analysisId, { sort: 'newest', offset: 0, limit: pageSize });
  const rows = [...first.rows];
  for (let offset = rows.length; offset < first.total; offset += pageSize) {
    const page = await queryConversationMetrics(analysisId, { sort: 'newest', offset, limit: pageSize });
    rows.push(...page.rows);
  }
  return rows;
}

export async function buildAnalyticsExport(analysisId: string): Promise<AnalyticsExport> {
  const [overview, models, conversations] = await Promise.all([
    getOverviewMetrics(analysisId),
    getModelMetrics(analysisId),
    allConversationRows(analysisId)
  ]);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    overview: {
      conversations: overview.totals.conversations,
      messages: overview.totals.messages,
      visibleTokens: overview.totals.visibleTokens,
      peakDay: overview.peakDay?.key ?? null,
      largestConversationTitle: overview.largestConversation?.title ?? null
    },
    models: models.map((model) => ({
      modelId: model.modelId,
      visibleTokens: model.visibleTokens,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      messages: model.messages,
      conversations: model.conversations,
      rawAliases: [...model.rawAliases]
    })),
    conversations: conversations.map((conversation) => ({
      title: conversation.title,
      visibleTokens: conversation.visibleTokens,
      messages: conversation.messages,
      modelIds: [...conversation.modelIds]
    }))
  };
}

function download(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

function serialize(format: ExportFormat, data: AnalyticsExport): { content: string; mimeType: string } {
  if (format === 'json') return { content: exportJson(data), mimeType: 'application/json;charset=utf-8' };
  if (format === 'csv') return { content: exportCsv(data), mimeType: 'text/csv;charset=utf-8' };
  return { content: exportMarkdown(data), mimeType: 'text/markdown;charset=utf-8' };
}

export function ExportResultsButton({ analysisId }: ExportResultsButtonProps) {
  const [busy, setBusy] = useState<ExportFormat>();
  const [error, setError] = useState<string>();

  const run = async (format: ExportFormat): Promise<void> => {
    setBusy(format);
    setError(undefined);
    try {
      const data = await buildAnalyticsExport(analysisId);
      const serialized = serialize(format, data);
      download(serialized.content, `chatgpt-export-profiler-${analysisId.slice(0, 8)}.${format}`, serialized.mimeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export analytics.');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="export-actions" aria-label="Export analytics">
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('json')}>
        {busy === 'json' ? 'Exporting…' : 'Export JSON'}
      </button>
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('csv')}>
        {busy === 'csv' ? 'Exporting…' : 'Export CSV'}
      </button>
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('md')}>
        {busy === 'md' ? 'Exporting…' : 'Export Markdown'}
      </button>
      {error ? <span role="alert" className="inline-error">{error}</span> : null}
    </div>
  );
}
