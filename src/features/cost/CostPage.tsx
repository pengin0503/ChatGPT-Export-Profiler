import { useEffect, useMemo, useState } from 'react';
import { calculateHistoricalVisibleCost, calculateScenarioCost, type PricingRecord } from '../../analysis/pricing';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import { MetricBadge } from '../../components/MetricBadge';
import { BUILT_IN_PRICING_V1 } from '../../data/pricing.v1';
import { formatMessage, useI18n } from '../../i18n';
import { getModelMetrics, type StoredModelMetric } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';
import { CostScenarioEditor, type CostScenarioRequest } from './CostScenarioEditor';

interface CostPageProps {
  analysisId: string;
}

interface ScenarioView {
  lower: number;
  upper: number;
  request: CostScenarioRequest;
}

function latestPrice(modelId: string, pricing: readonly PricingRecord[]): PricingRecord | undefined {
  return pricing
    .filter((record) => record.model === modelId)
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) || Number(b.source === 'local user override') - Number(a.source === 'local user override'))[0];
}

function money(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(value);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseStoredScenario(value: unknown): ScenarioView | undefined {
  const profile = objectValue(value);
  const request = objectValue(profile?.request);
  const assumptions = objectValue(request?.assumptions ?? profile?.assumptions);
  if (
    typeof profile?.lower !== 'number' ||
    typeof profile.upper !== 'number' ||
    typeof request?.replacementModelId !== 'string' ||
    typeof assumptions?.cacheRatio !== 'number' ||
    typeof assumptions.hiddenInputOverheadRatio !== 'number' ||
    typeof assumptions.reasoningOutputOverheadRatio !== 'number'
  ) return undefined;
  return {
    lower: profile.lower,
    upper: profile.upper,
    request: {
      replacementModelId: request.replacementModelId,
      assumptions: {
        cacheRatio: assumptions.cacheRatio,
        hiddenInputOverheadRatio: assumptions.hiddenInputOverheadRatio,
        reasoningOutputOverheadRatio: assumptions.reasoningOutputOverheadRatio
      }
    }
  };
}

async function loadStoredScenario(analysisId: string): Promise<ScenarioView | undefined> {
  const db = await openProfilerDb();
  try {
    return parseStoredScenario((await db.get('costProfiles', `scenario:${analysisId}`))?.value);
  } finally {
    db.close();
  }
}

export function CostPage({ analysisId }: CostPageProps) {
  const { locale, t } = useI18n();
  const [models, setModels] = useState<StoredModelMetric[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([...BUILT_IN_PRICING_V1]);
  const [scenario, setScenario] = useState<ScenarioView>();
  const [loadError, setLoadError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getModelMetrics(analysisId), loadPricingRecords(), loadStoredScenario(analysisId)])
      .then(([modelRows, pricingRows, storedScenario]) => {
        if (!active) return;
        setModels(modelRows);
        setPricing(pricingRows);
        setScenario(storedScenario);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : t('cost.loadFailed'));
        setLoaded(true);
      });
    return () => { active = false; };
  }, [analysisId, t]);

  const visible = useMemo(() => {
    let cost = 0;
    const coverageGaps: string[] = [];
    for (const model of models) {
      const result = calculateHistoricalVisibleCost(model.modelId, model.usageByDay, pricing);
      cost += result.cost;
      if (result.missingUsageHistory) {
        coverageGaps.push(formatMessage(t('cost.missingUsageHistory'), { model: model.modelId }));
      }
      if (result.missingDates.length) {
        coverageGaps.push(formatMessage(t('cost.missingPriceDates'), { model: model.modelId, dates: result.missingDates.join(', ') }));
      }
    }
    return { cost, coverageGaps };
  }, [models, pricing, t]);

  const modelIds = useMemo(() => [...new Set(pricing.map((record) => record.model))].sort(), [pricing]);

  async function calculate(request: CostScenarioRequest): Promise<void> {
    const price = latestPrice(request.replacementModelId, pricing);
    if (!price) {
      setLoadError(formatMessage(t('cost.noPrice'), { model: request.replacementModelId }));
      return;
    }
    const usage = models.reduce(
      (total, model) => ({ inputTokens: total.inputTokens + model.inputTokens, outputTokens: total.outputTokens + model.outputTokens }),
      { inputTokens: 0, outputTokens: 0 }
    );
    const result = calculateScenarioCost(usage, price, request.assumptions);
    const view = { lower: result.lower, upper: result.upper, request };
    setScenario(view);
    setLoadError(undefined);

    const db = await openProfilerDb();
    try {
      await db.put('costProfiles', {
        key: `scenario:${analysisId}`,
        value: { ...view, assumptions: { ...request.assumptions }, provenance: 'estimated' }
      });
    } finally {
      db.close();
    }
  }

  return (
    <section className="analytics-page" aria-labelledby="cost-heading">
      <p className="eyebrow">{t('cost.eyebrow')}</p>
      <h2 id="cost-heading">{t('nav.cost')}</h2>
      <p className="muted-copy">{t('cost.description')}</p>
      {!loaded ? <p className="muted-copy">{t('cost.loading')}</p> : (
        <>
          <div className="metric-grid">
            <MetricBadge
              label={t('cost.visibleEquivalent')}
              value={money(visible.cost, locale)}
              provenance="calculated"
              detail={visible.coverageGaps.length ? t('cost.coverageAttention') : t('cost.coverageComplete')}
            />
            {scenario ? (
              <MetricBadge
                label={t('cost.estimatedScenario')}
                value={`${money(scenario.lower, locale)}–${money(scenario.upper, locale)}`}
                provenance="estimated"
                detail={formatMessage(t('cost.assumptions'), {
                  model: scenario.request.replacementModelId,
                  cache: scenario.request.assumptions.cacheRatio,
                  hidden: scenario.request.assumptions.hiddenInputOverheadRatio,
                  reasoning: scenario.request.assumptions.reasoningOutputOverheadRatio
                })}
              />
            ) : null}
          </div>
          {visible.coverageGaps.length ? <p className="quality-note">{formatMessage(t('cost.coverageGap'), { gaps: visible.coverageGaps.join('; ') })}</p> : null}
          <CostScenarioEditor modelIds={modelIds} onCalculate={calculate} />
        </>
      )}
      {loadError ? <p className="inline-error" role="alert">{loadError}</p> : null}
    </section>
  );
}
