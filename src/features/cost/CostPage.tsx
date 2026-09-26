import { useEffect, useMemo, useState } from 'react';
import { calculateHistoricalVisibleCost, calculateScenarioCost, type PricingRecord } from '../../analysis/pricing';
import { MetricBadge } from '../../components/MetricBadge';
import { BUILT_IN_PRICING_V1 } from '../../data/pricing.v1';
import { openProfilerDb } from '../../storage/db';
import { getModelMetrics, type StoredModelMetric } from '../../storage/analyticsQueries';
import { CostScenarioEditor, type CostScenarioRequest } from './CostScenarioEditor';
import { loadPricingRecords } from '../../analysis/pricingHistory';

interface CostPageProps {
  analysisId: string;
}

interface ScenarioView {
  lower: number;
  upper: number;
  request: CostScenarioRequest;
}

function milliseconds(timestamp: number): number {
  return timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
}


function latestPrice(modelId: string, pricing: readonly PricingRecord[]): PricingRecord | undefined {
  return pricing
    .filter((record) => record.model === modelId)
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) || Number(b.source === 'local user override') - Number(a.source === 'local user override'))[0];
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(value);
}

export function CostPage({ analysisId }: CostPageProps) {
  const [models, setModels] = useState<StoredModelMetric[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([...BUILT_IN_PRICING_V1]);
  const [scenario, setScenario] = useState<ScenarioView>();
  const [loadError, setLoadError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getModelMetrics(analysisId), loadPricingRecords()])
      .then(([modelRows, pricingRows]) => {
        if (!active) return;
        setModels(modelRows);
        setPricing(pricingRows);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load cost data.');
        setLoaded(true);
      });
    return () => { active = false; };
  }, [analysisId]);

  const visible = useMemo(() => {
    let cost = 0;
    const coverageGaps: string[] = [];
    for (const model of models) {
      const result = calculateHistoricalVisibleCost(model.modelId, model.usageByDay, pricing);
      cost += result.cost;
      if (result.missingUsageHistory) {
        coverageGaps.push(`${model.modelId}: date-level usage history unavailable; reimport this analysis`);
      }
      if (result.missingDates.length) {
        coverageGaps.push(`${model.modelId}: no applicable price on ${result.missingDates.join(', ')}`);
      }
    }
    return { cost, coverageGaps };
  }, [models, pricing]);

  const modelIds = useMemo(() => [...new Set(pricing.map((record) => record.model))].sort(), [pricing]);

  async function calculate(request: CostScenarioRequest): Promise<void> {
    const price = latestPrice(request.replacementModelId, pricing);
    if (!price) {
      setLoadError(`No pricing record is available for ${request.replacementModelId}.`);
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
      <p className="eyebrow">API-EQUIVALENT ANALYSIS</p>
      <h2 id="cost-heading">Cost</h2>
      <p className="muted-copy">These values use API pricing as an analytical equivalent and are not ChatGPT subscription charges.</p>
      {!loaded ? <p className="muted-copy">Loading cost data…</p> : (
        <>
          <div className="metric-grid">
            <MetricBadge
              label="Visible-token API-equivalent cost"
              value={money(visible.cost)}
              provenance="calculated"
              detail={visible.coverageGaps.length ? 'One or more model/date ranges need attention.' : 'All observed model/date pairs have pricing coverage.'}
            />
            {scenario ? (
              <MetricBadge
                label="Estimated scenario cost"
                value={`${money(scenario.lower)}–${money(scenario.upper)}`}
                provenance="estimated"
                detail={`Assumptions: ${scenario.request.replacementModelId}; cache ${scenario.request.assumptions.cacheRatio}; hidden input ${scenario.request.assumptions.hiddenInputOverheadRatio}; reasoning output ${scenario.request.assumptions.reasoningOutputOverheadRatio}.`}
              />
            ) : null}
          </div>
          {visible.coverageGaps.length ? <p className="quality-note">Coverage gap: {visible.coverageGaps.join('; ')}.</p> : null}
          <CostScenarioEditor modelIds={modelIds} onCalculate={calculate} />
        </>
      )}
      {loadError ? <p className="inline-error" role="alert">{loadError}</p> : null}
    </section>
  );
}
