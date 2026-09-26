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

function modelCost(model: StoredModelMetric, pricing: readonly PricingRecord[], coverageGapLabel: string): string {
  const result = calculateHistoricalVisibleCost(model.modelId, model.usageByDay, pricing);
  if (result.missingUsageHistory || result.missingDates.length > 0) return coverageGapLabel;
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
      <p className="eyebrow">{t('models.eyebrow')}</p>
      <h2 id="models-heading">{t('nav.models')}</h2>
      <div className="table-shell">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>{t('models.model')}</th>
              <th>{t('models.tokens')}</th>
              <th>{t('models.share')}</th>
              <th>{t('models.messages')}</th>
              <th>{t('models.conversations')}</th>
              <th>{t('models.input')}</th>
              <th>{t('models.output')}</th>
              <th>{t('models.apiEquivalentCost')}</th>
              <th>{t('models.first')}</th>
              <th>{t('models.last')}</th>
              <th>{t('models.rawAliases')}</th>
            </tr>
          </thead>
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
                <td>{modelCost(model, pricing, t('models.coverageGap'))}</td>
                <td>{formatDate(model.firstTimestamp)}</td>
                <td>{formatDate(model.lastTimestamp)}</td>
                <td>{model.rawAliases.join(', ') || '—'}</td>
              </tr>
            ))}
            {models.length === 0 ? <tr><td colSpan={11}>{t('models.empty')}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="data-note">{t('models.costNote')}</p>
    </section>
  );
}
