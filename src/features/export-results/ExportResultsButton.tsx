import { useState } from 'react';
import { calculateHistoricalVisibleCost, type PricingRecord } from '../../analysis/pricing';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import { useI18n } from '../../i18n';
import { forEachConversationMetric, getModelMetrics, getOverviewMetrics } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';
import { type AnalyticsExport, type AnalyticsExportScenario } from './exportJson';
import { buildStreamingAnalyticsBlob, type StreamExportFormat } from './streamExport';

interface ExportResultsButtonProps {
  analysisId: string;
}

type ExportFormat = StreamExportFormat;

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

async function buildAnalyticsExportBase(analysisId: string): Promise<AnalyticsExport> {
  const [overview, models, pricing, storedScenario] = await Promise.all([
    getOverviewMetrics(analysisId),
    getModelMetrics(analysisId),
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
    conversations: [],
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

// Full materialization is retained only as a deterministic test/programmatic helper.
// The interactive download path below streams conversation rows through bounded string chunks.
// eslint-disable-next-line react-refresh/only-export-components
export async function buildAnalyticsExport(analysisId: string): Promise<AnalyticsExport> {
  const report = await buildAnalyticsExportBase(analysisId);
  const conversations: AnalyticsExport['conversations'] = [];
  await forEachConversationMetric(analysisId, (conversation) => {
    conversations.push({
      title: conversation.title,
      visibleTokens: conversation.visibleTokens,
      messages: conversation.messages,
      modelIds: [...conversation.modelIds]
    });
  });
  return { ...report, conversations };
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportResultsButton({ analysisId }: ExportResultsButtonProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ExportFormat>();
  const [error, setError] = useState<string>();
  const [includeTitles, setIncludeTitles] = useState(false);

  const run = async (format: ExportFormat): Promise<void> => {
    setBusy(format);
    setError(undefined);
    try {
      const base = await buildAnalyticsExportBase(analysisId);
      const blob = await buildStreamingAnalyticsBlob(base, analysisId, format, {
        includeConversationTitles: includeTitles
      });
      download(blob, `chatgpt-export-profiler-${analysisId.slice(0, 8)}.${format}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('export.failed'));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="export-actions" aria-label={t('export.aria')}>
      <label className="check-filter" title={t('export.includeTitlesDetail')}>
        <input type="checkbox" checked={includeTitles} onChange={(event) => setIncludeTitles(event.target.checked)} />
        {t('export.includeTitles')}
      </label>
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('json')}>
        {busy === 'json' ? t('export.exporting') : t('export.json')}
      </button>
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('csv')}>
        {busy === 'csv' ? t('export.exporting') : t('export.csv')}
      </button>
      <button type="button" className="secondary-action" disabled={busy !== undefined} onClick={() => void run('md')}>
        {busy === 'md' ? t('export.exporting') : t('export.markdown')}
      </button>
      {error ? <span role="alert" className="inline-error">{error}</span> : null}
    </div>
  );
}
