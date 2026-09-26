import { useEffect, useMemo, useState } from 'react';
import { calculateHistoricalVisibleCost } from '../../analysis/pricing';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import { MetricBadge } from '../../components/MetricBadge';
import { DateRangeFilter, type RangePreset } from '../../components/DateRangeFilter';
import { useI18n } from '../../i18n';
import {
  dayInRange,
  getModelMetrics,
  getOverviewMetrics,
  getTopModelId,
  type DateRange,
  type OverviewMetrics,
  type StoredModelMetric
} from '../../storage/analyticsQueries';
import type { PricingRecord } from '../../analysis/pricing';
import { ExportResultsButton } from '../export-results/ExportResultsButton';

interface OverviewPageProps { analysisId: string }

const EMPTY: OverviewMetrics = {
  totals: { conversations: 0, messages: 0, visibleTokens: 0 },
  peakDay: null,
  largestConversation: null
};

function money(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 6
  }).format(value);
}

function usageInRange(model: StoredModelMetric, range?: DateRange) {
  if (!range) return model.usageByDay;
  return Object.fromEntries(Object.entries(model.usageByDay).filter(([day]) => dayInRange(day, range)));
}

export function OverviewPage({ analysisId }: OverviewPageProps) {
  const { locale, t } = useI18n();
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [range, setRange] = useState<DateRange | undefined>();
  const [overview, setOverview] = useState<OverviewMetrics>(EMPTY);
  const [topModel, setTopModel] = useState('—');
  const [models, setModels] = useState<StoredModelMetric[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getOverviewMetrics(analysisId, range),
      getTopModelId(analysisId, range),
      getModelMetrics(analysisId),
      loadPricingRecords()
    ]).then(([next, nextTopModel, nextModels, nextPricing]) => {
      if (!active) return;
      setOverview(next);
      setTopModel(nextTopModel ?? '—');
      setModels(nextModels);
      setPricing(nextPricing);
    });
    return () => { active = false; };
  }, [analysisId, range]);

  const visibleCost = useMemo(() => {
    let cost = 0;
    let complete = true;
    for (const model of models) {
      const usage = usageInRange(model, range);
      if (Object.keys(usage).length === 0) continue;
      const result = calculateHistoricalVisibleCost(model.modelId, usage, pricing);
      cost += result.cost;
      if (result.missingUsageHistory || result.missingDates.length > 0) complete = false;
    }
    return { cost, complete };
  }, [models, pricing, range]);

  const processingUpper = Math.round(overview.totals.visibleTokens * 1.5);
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
        <MetricBadge
          label={t('overview.estimatedProcessingTokens')}
          value={`${overview.totals.visibleTokens.toLocaleString()}–${processingUpper.toLocaleString()}`}
          provenance="estimated"
          detail={t('overview.processingRangeDetail')}
        />
        <MetricBadge
          label={t('overview.visibleApiEquivalentCost')}
          value={money(visibleCost.cost, locale)}
          provenance="calculated"
          detail={visibleCost.complete ? undefined : t('overview.costCoverageGap')}
        />
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
