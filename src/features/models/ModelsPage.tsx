import { useEffect, useMemo, useState } from 'react';
import { calculateHistoricalVisibleCost, type PricingRecord } from '../../analysis/pricing';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import { useI18n } from '../../i18n';
import { getModelMetrics, type StoredModelMetric } from '../../storage/analyticsQueries';

interface ModelsPageProps { analysisId: string }

function toMilliseconds(timestamp?: number): number | undefined {
  if (timestamp === undefined) return undefined;
  return timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatDate(timestamp?: number): string {
  const ms = toMilliseconds(timestamp);
  return ms === undefined ? '—' : new Date(ms).toISOString().slice(0, 10);
}

function modelCost(model: StoredModelMetric, pricing: readonly PricingRecord[]): string {
  const result = calculateHistoricalVisibleCost(model.modelId, model.usageByDay, pricing);
  if (result.missingUsageHistory || result.missingDates.length > 0) return 'coverage gap';
  return `$${result.cost.toFixed(4)}`;
}

export function ModelsPage({ analysisId }: ModelsPageProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<StoredModelMetric[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.all([getModelMetrics(analysisId), loadPricingRecords()]).then(([nextModels, nextPricing]) => {
      if (!active) return;
      setModels(nextModels);
      setPricing(nextPricing);
    });
    return () => { active = false; };
  }, [analysisId]);
  const totalTokens = useMemo(() => models.reduce((sum, model) => sum + model.visibleTokens, 0), [models]);

  return (
    <section className="analytics-page" aria-labelledby="models-heading">
      <p className="eyebrow">CALCULATED MODEL BREAKDOWN</p>
      <h2 id="models-heading">{t('nav.models')}</h2>
      <div className="table-shell">
        <table className="analytics-table">
          <thead><tr><th>Model</th><th>Tokens</th><th>Share</th><th>Messages</th><th>Conversations</th><th>Input</th><th>Output</th><th>API-equivalent cost</th><th>First</th><th>Last</th><th>Raw aliases</th></tr></thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.modelId}>
                <td>{model.modelId}</td>
                <td>{model.visibleTokens.toLocaleString()}</td>
                <td>{totalTokens ? `${((model.visibleTokens / totalTokens) * 100).toFixed(1)}%` : '0%'}</td>
                <td>{model.messages.toLocaleString()}</td>
                <td>{model.conversations.toLocaleString()}</td>
                <td>{model.inputTokens.toLocaleString()}</td>
                <td>{model.outputTokens.toLocaleString()}</td>
                <td>{modelCost(model, pricing)}</td>
                <td>{formatDate(model.firstTimestamp)}</td>
                <td>{formatDate(model.lastTimestamp)}</td>
                <td>{model.rawAliases.join(', ') || '—'}</td>
              </tr>
            ))}
            {models.length === 0 ? <tr><td colSpan={11}>No model metrics are stored for this analysis.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="data-note">API-equivalent cost uses the effective pricing history for each observed usage day, including local overrides. It is not ChatGPT subscription billing.</p>
    </section>
  );
}
