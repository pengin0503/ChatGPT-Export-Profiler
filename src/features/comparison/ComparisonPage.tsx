import { useEffect, useMemo, useState } from 'react';
import { MetricBadge } from '../../components/MetricBadge';
import { useI18n } from '../../i18n';
import { getOverviewMetrics } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';

export type ComparisonProvenance = 'calculated' | 'estimated' | 'reported';

interface ReportedSummary {
  tokens: number;
  provenance: 'reported';
}

export function ComparisonPage({ analysisId }: { analysisId: string }) {
  const { t } = useI18n();
  const [chatTokens, setChatTokens] = useState(0);
  const [reportedInput, setReportedInput] = useState('');
  const [reported, setReported] = useState<ReportedSummary>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      getOverviewMetrics(analysisId),
      openProfilerDb().then(async (db) => {
        try { return await db.get('settings', `comparison:${analysisId}`); } finally { db.close(); }
      })
    ]).then(([overview, stored]) => {
      if (!active) return;
      setChatTokens(overview.totals.visibleTokens);
      if (typeof stored?.value === 'object' && stored.value !== null) {
        const value = stored.value as Record<string, unknown>;
        if (typeof value.tokens === 'number' && value.tokens >= 0) {
          setReported({ tokens: value.tokens, provenance: 'reported' });
          setReportedInput(String(value.tokens));
        }
      }
    });
    return () => { active = false; };
  }, [analysisId]);

  const estimatedRange = useMemo(() => ({ lower: chatTokens, upper: Math.round(chatTokens * 1.5) }), [chatTokens]);

  async function save(): Promise<void> {
    const tokens = Number(reportedInput);
    if (!Number.isFinite(tokens) || tokens < 0) {
      setError(t('comparison.invalidTokens'));
      return;
    }
    const value: ReportedSummary = { tokens, provenance: 'reported' };
    const db = await openProfilerDb();
    try {
      await db.put('settings', { key: `comparison:${analysisId}`, value });
    } finally {
      db.close();
    }
    setReported(value);
    setError(undefined);
  }

  return (
    <section className="analytics-page" aria-labelledby="comparison-heading">
      <p className="eyebrow">{t('comparison.eyebrow')}</p>
      <h2 id="comparison-heading">{t('nav.comparison')}</h2>
      <p className="quality-note">{t('comparison.note')}</p>
      <div className="metric-grid">
        <MetricBadge label={t('comparison.chatVisibleTokens')} value={chatTokens.toLocaleString()} provenance="calculated" />
        <MetricBadge label={t('comparison.processingRange')} value={`${estimatedRange.lower.toLocaleString()}–${estimatedRange.upper.toLocaleString()}`} provenance="estimated" detail={t('comparison.processingRangeDetail')} />
        {reported ? (
          <article className="metric-card">
            <span className="metric-label">{t('comparison.workSummary')}</span>
            <strong className="metric-value">{reported.tokens.toLocaleString()}</strong>
            <span className="provenance provenance-reported">{t('comparison.reported')}</span>
          </article>
        ) : null}
      </div>
      <section className="panel" aria-labelledby="reported-heading">
        <h3 id="reported-heading">{t('comparison.manualTitle')}</h3>
        <label>
          <span>{t('comparison.reportedTokens')}</span>
          <input aria-label={t('comparison.reportedTokens')} inputMode="numeric" value={reportedInput} onChange={(event) => setReportedInput(event.target.value)} />
        </label>
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        <button className="primary-action" type="button" onClick={() => void save()}>{t('comparison.save')}</button>
      </section>
    </section>
  );
}
