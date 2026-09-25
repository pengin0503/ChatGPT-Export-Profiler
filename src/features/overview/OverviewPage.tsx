import { useEffect, useMemo, useState } from 'react';
import { MetricBadge } from '../../components/MetricBadge';
import { DateRangeFilter, type RangePreset } from '../../components/DateRangeFilter';
import { getModelMetrics, getOverviewMetrics, type DateRange, type OverviewMetrics, type StoredModelMetric } from '../../storage/analyticsQueries';

interface OverviewPageProps { analysisId: string }

const EMPTY: OverviewMetrics = {
  totals: { conversations: 0, messages: 0, visibleTokens: 0 },
  peakDay: null,
  largestConversation: null
};

export function OverviewPage({ analysisId }: OverviewPageProps) {
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [range, setRange] = useState<DateRange | undefined>();
  const [overview, setOverview] = useState<OverviewMetrics>(EMPTY);
  const [models, setModels] = useState<StoredModelMetric[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([getOverviewMetrics(analysisId, range), getModelMetrics(analysisId)]).then(([next, nextModels]) => {
      if (!active) return;
      setOverview(next);
      setModels(nextModels);
    });
    return () => { active = false; };
  }, [analysisId, range]);

  const topModel = useMemo(() => models[0]?.modelId ?? '—', [models]);
  const conversationLabel = `${overview.totals.conversations.toLocaleString()} ${overview.totals.conversations === 1 ? 'conversation' : 'conversations'}`;
  const messageLabel = `${overview.totals.messages.toLocaleString()} ${overview.totals.messages === 1 ? 'message' : 'messages'}`;

  return (
    <section className="analytics-page" aria-labelledby="overview-heading">
      <div className="section-heading-row">
        <div><p className="eyebrow">ANALYSIS</p><h2 id="overview-heading">Overview</h2></div>
        <DateRangeFilter value={rangePreset} onChange={(preset, nextRange) => { setRangePreset(preset); setRange(nextRange); }} />
      </div>
      <div className="metric-grid">
        <MetricBadge label="Visible tokens" value={`${overview.totals.visibleTokens.toLocaleString()} visible tokens`} provenance="calculated" />
        <MetricBadge label="Conversations" value={conversationLabel} provenance="observed" />
        <MetricBadge label="Messages" value={messageLabel} provenance="observed" />
        <MetricBadge label="Top model" value={topModel} provenance="calculated" />
      </div>
      <div className="panel-grid">
        <article className="analytics-panel"><h3>Peak day</h3><strong>{overview.peakDay?.key ?? '—'}</strong><p>{overview.peakDay ? `${overview.peakDay.messages} messages · ${overview.peakDay.visibleTokens.toLocaleString()} tokens` : 'No dated usage in this range.'}</p></article>
        <article className="analytics-panel"><h3>Largest conversation</h3><strong>{overview.largestConversation?.title ?? '—'}</strong><p>{overview.largestConversation ? `${overview.largestConversation.visibleTokens.toLocaleString()} visible tokens` : 'No conversations in this range.'}</p></article>
      </div>
    </section>
  );
}
