import { useEffect, useMemo, useState } from 'react';
import { calculateVisibleCost, findPrice } from '../../analysis/pricing';
import { BUILT_IN_PRICING_V1 } from '../../data/pricing.v1';
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

function modelCost(model: StoredModelMetric): string {
  const timestamp = toMilliseconds(model.firstTimestamp);
  if (timestamp === undefined) return '—';
  const record = findPrice(model.modelId, timestamp, BUILT_IN_PRICING_V1);
  if (!record) return 'coverage gap';
  return `$${calculateVisibleCost(model.inputTokens, model.outputTokens, record).toFixed(4)}`;
}

export function ModelsPage({ analysisId }: ModelsPageProps) {
  const [models, setModels] = useState<StoredModelMetric[]>([]);
  useEffect(() => {
    let active = true;
    void getModelMetrics(analysisId).then((value) => { if (active) setModels(value); });
    return () => { active = false; };
  }, [analysisId]);
  const totalTokens = useMemo(() => models.reduce((sum, model) => sum + model.visibleTokens, 0), [models]);

  return (
    <section className="analytics-page" aria-labelledby="models-heading">
      <p className="eyebrow">CALCULATED MODEL BREAKDOWN</p>
      <h2 id="models-heading">Models</h2>
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
                <td>{modelCost(model)}</td>
                <td>{formatDate(model.firstTimestamp)}</td>
                <td>{formatDate(model.lastTimestamp)}</td>
                <td>{model.rawAliases.join(', ') || '—'}</td>
              </tr>
            ))}
            {models.length === 0 ? <tr><td colSpan={11}>No model metrics are stored for this analysis.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="data-note">API-equivalent cost is calculated only when a built-in price covers the model's first-seen date. It is not ChatGPT subscription billing.</p>
    </section>
  );
}
