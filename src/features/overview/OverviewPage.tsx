import { useEffect, useState } from 'react';
import { MetricBadge } from '../../components/MetricBadge';
import { DateRangeFilter, type RangePreset } from '../../components/DateRangeFilter';
import { useI18n } from '../../i18n';
import { getOverviewMetrics, getTopModelId, type DateRange, type OverviewMetrics } from '../../storage/analyticsQueries';
import { ExportResultsButton } from '../export-results/ExportResultsButton';

interface OverviewPageProps { analysisId: string }

const EMPTY: OverviewMetrics = {
  totals: { conversations: 0, messages: 0, visibleTokens: 0 },
  peakDay: null,
  largestConversation: null
};

export function OverviewPage({ analysisId }: OverviewPageProps) {
  const { t } = useI18n();
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [range, setRange] = useState<DateRange | undefined>();
  const [overview, setOverview] = useState<OverviewMetrics>(EMPTY);
  const [topModel, setTopModel] = useState('—');

  useEffect(() => {
    let active = true;
    void Promise.all([getOverviewMetrics(analysisId, range), getTopModelId(analysisId, range)]).then(([next, nextTopModel]) => {
      if (!active) return;
      setOverview(next);
      setTopModel(nextTopModel ?? '—');
    });
    return () => { active = false; };
  }, [analysisId, range]);

  const conversationUnit = overview.totals.conversations === 1 ? t('unit.conversation') : t('unit.conversations');
  const messageUnit = overview.totals.messages === 1 ? t('unit.message') : t('unit.messages');
  const conversationLabel = `${overview.totals.conversations.toLocaleString()} ${conversationUnit}`;
  const messageLabel = `${overview.totals.messages.toLocaleString()} ${messageUnit}`;

  return (
    <section className="analytics-page" aria-labelledby="overview-heading">
      <div className="section-heading-row">
        <div><p className="eyebrow">{t('overview.eyebrow')}</p><h2 id="overview-heading">{t('nav.overview')}</h2></div>
        <div className="overview-actions">
          <DateRangeFilter value={rangePreset} onChange={(preset, nextRange) => { setRangePreset(preset); setRange(nextRange); }} />
          <ExportResultsButton analysisId={analysisId} />
        </div>
      </div>
      <div className="metric-grid">
        <MetricBadge label={t('overview.visibleTokens')} value={`${overview.totals.visibleTokens.toLocaleString()} ${t('unit.visibleTokens')}`} provenance="calculated" />
        <MetricBadge label={t('overview.conversations')} value={conversationLabel} provenance="observed" />
        <MetricBadge label={t('overview.messages')} value={messageLabel} provenance="observed" />
        <MetricBadge label={t('overview.topModel')} value={topModel} provenance="calculated" />
      </div>
      <div className="panel-grid">
        <article className="analytics-panel">
          <h3>{t('overview.peakDay')}</h3>
          <strong>{overview.peakDay?.key ?? '—'}</strong>
          <p>{overview.peakDay
            ? `${overview.peakDay.messages.toLocaleString()} ${t('unit.messages')} · ${overview.peakDay.visibleTokens.toLocaleString()} ${t('unit.tokens')}`
            : t('overview.noDatedUsage')}</p>
        </article>
        <article className="analytics-panel">
          <h3>{t('overview.largestConversation')}</h3>
          <strong>{overview.largestConversation?.title ?? '—'}</strong>
          <p>{overview.largestConversation
            ? `${overview.largestConversation.visibleTokens.toLocaleString()} ${t('unit.visibleTokens')}`
            : t('overview.noConversations')}</p>
        </article>
      </div>
    </section>
  );
}
