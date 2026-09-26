import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { getTimelineMetrics, type StoredTimelineMetric, type TimelineKind } from '../../storage/analyticsQueries';

interface TimelinePageProps { analysisId: string }
type TimelineMeasure = 'visibleTokens' | 'messages' | 'conversations';

function heatmapKey(hourKey: string): string | undefined {
  const date = new Date(`${hourKey}:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCDay()}-${date.getUTCHours()}`;
}

export function TimelinePage({ analysisId }: TimelinePageProps) {
  const { t } = useI18n();
  const [kind, setKind] = useState<TimelineKind>('day');
  const [measure, setMeasure] = useState<TimelineMeasure>('visibleTokens');
  const [points, setPoints] = useState<StoredTimelineMetric[]>([]);
  const [hours, setHours] = useState<StoredTimelineMetric[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([getTimelineMetrics(analysisId, kind), getTimelineMetrics(analysisId, 'hour')]).then(([next, hourly]) => {
      if (!active) return;
      setPoints(next);
      setHours(hourly);
    });
    return () => { active = false; };
  }, [analysisId, kind]);

  const heatmap = useMemo(() => {
    const values = new Map<string, number>();
    for (const point of hours) {
      const key = heatmapKey(point.key);
      if (key) values.set(key, (values.get(key) ?? 0) + point.visibleTokens);
    }
    return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [hours]);

  const bucketLabels: Record<TimelineKind, string> = {
    hour: t('timeline.hour'),
    day: t('timeline.day'),
    week: t('timeline.week'),
    month: t('timeline.month'),
    year: t('timeline.year')
  };

  return (
    <section className="analytics-page" aria-labelledby="timeline-heading">
      <div className="section-heading-row">
        <div><p className="eyebrow">{t('timeline.eyebrow')}</p><h2 id="timeline-heading">{t('nav.timeline')}</h2></div>
        <div className="filter-row">
          <label className="filter-control">
            <span>{t('timeline.bucket')}</span>
            <select aria-label={t('timeline.bucketAria')} value={kind} onChange={(event) => setKind(event.target.value as TimelineKind)}>
              {(['hour', 'day', 'week', 'month', 'year'] as TimelineKind[]).map((value) => <option key={value} value={value}>{bucketLabels[value]}</option>)}
            </select>
          </label>
          <label className="filter-control">
            <span>{t('timeline.metric')}</span>
            <select aria-label={t('timeline.metricAria')} value={measure} onChange={(event) => setMeasure(event.target.value as TimelineMeasure)}>
              <option value="visibleTokens">{t('timeline.tokens')}</option>
              <option value="messages">{t('timeline.messages')}</option>
              <option value="conversations">{t('timeline.conversations')}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="timeline-bars" role="list" aria-label={t('timeline.listAria')}>
        {points.map((point) => <div className="timeline-row" role="listitem" key={point.key}><span>{point.key}</span><strong>{point[measure].toLocaleString()}</strong></div>)}
        {points.length === 0 ? <p className="data-note">{t('timeline.empty')}</p> : null}
      </div>
      <article className="analytics-panel">
        <h3>{t('timeline.heatmapTitle')}</h3>
        <p className="data-note">{t('timeline.heatmapNote')}</p>
        <div className="heatmap-summary">{heatmap.map(([key, value]) => { const [day, hour] = key.split('-'); return <span className="heat-cell" key={key}>D{day} {hour?.padStart(2,'0')}:00 · {value.toLocaleString()}</span>; })}</div>
      </article>
    </section>
  );
}
