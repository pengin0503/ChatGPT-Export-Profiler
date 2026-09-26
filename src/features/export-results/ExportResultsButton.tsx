import { useState } from 'react';
import { calculateHistoricalVisibleCost, type PricingRecord } from '../../analysis/pricing';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import { getModelMetrics, getOverviewMetrics, listAllConversationMetrics } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';
import { exportCsv } from './exportCsv';
import { exportJson, type AnalyticsExport, type AnalyticsExportScenario } from './exportJson';
import { exportMarkdown } from './exportMarkdown';

interface ExportResultsButtonProps {
  analysisId: string;
}

type ExportFormat = 'json' | 'csv' | 'md';

async function getStoredScenario(analysisId: string): Promise<unknown> {
  const db = await openProfilerDb();
  try {
    return (await db.get('costProfiles', `scenario:${analysisId}`))?.value;
  } finally {
    db.close();
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exportScenario(value: unknown): AnalyticsExportScenario | undefined {
  const profile = objectValue(value);
  const request = objectValue(profile?.request);
  const assumptions = objectValue(request?.assumptions ?? profile?.assumptions);
  const modelId = request?.replacementModelId;
  const lower = profile?.lower;
  const upper = profile?.upper;
  if (
    typeof modelId !== 'string' ||
    typeof lower !== 'number' ||
    typeof upper !== 'number' ||
    typeof assumptions?.cacheRatio !== 'number' ||
    typeof assumptions.hiddenInputOverheadRatio !== 'number' ||
    typeof assumptions.reasoningOutputOverheadRatio !== 'number'
  ) return undefined;

  return {
    lowerUsd: lower,
    upperUsd: upper,
    provenance: 'estimated',
    modelId,
    assumptions: {
      cacheRatio: assumptions.cacheRatio,
      hiddenInputOverheadRatio: assumptions.hiddenInputOverheadRatio,
      reasoningOutputOverheadRatio: assumptions.reasoningOutputOverheadRatio
    }
  };
}

export async function buildAnalyticsExport(analysisId: string): Promise<AnalyticsExport> {
  const [overview, models, conversations, pricing, storedScenario] = await Promise.all([
    getOverviewMetrics(analysisId),
    getModelMetrics(analysisId),
    listAllConversationMetrics(analysisId, { sort: 'newest' }),
    loadPricingRecords(),
    getStoredScenario(analysisId)
  ]);
  let visibleApiEquivalentUsd = 0;
  const pricingCoverageGaps: string[] = [];
  const appliedPricing = new Map<string, PricingRecord>();
  for (const model of models) {
    const result = calculateHistoricalVisibleCost(model.modelId, model.usageByDay, pricing);
    visibleApiEquivalentUsd += result.cost;
    if (result.missingUsageHistory) pricingCoverageGaps.push(`${model.modelId}: daily usage history unavailable`);
    if (result.missingDates.length) pricingCoverageGaps.push(`${model.modelId}: no applicable price on ${result.missingDates.join(', ')}`);
    for (const record of result.appliedPrices) {
      const key = [record.model, record.effectiveFrom, record.inputPerMillion, record.cachedInputPerMillion, record.outputPerMillion, record.source ?? ''].join('\u0000');
      appliedPricing.set(key, record);
    }
  }
  const scenario = exportScenario(storedScenario);

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
    })),
    cost: {
      visibleApiEquivalentUsd,
      visibleProvenance: 'calculated',
      pricing: [...appliedPricing.values()].map((record) => ({
        modelId: record.model,
        effectiveFrom: record.effectiveFrom,
        inputPerMillion: record.inputPerMillion,
        cachedInputPerMillion: record.cachedInputPerMillion,
        outputPerMillion: record.outputPerMillion,
        ...(record.source ? { source: record.source } : {})
      })),
      ...(pricingCoverageGaps.length ? { coverageGaps: pricingCoverageGaps } : {}),
      ...(scenario ? { scenario } : {})
    }
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
