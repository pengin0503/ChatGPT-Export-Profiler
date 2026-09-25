import { useEffect, useMemo, useState } from 'react';
import { getTimelineMetrics, type StoredTimelineMetric, type TimelineKind } from '../../storage/analyticsQueries';

interface TimelinePageProps { analysisId: string }
type TimelineMeasure = 'visibleTokens' | 'messages' | 'conversations';

function heatmapKey(hourKey: string): string | undefined {
  const date = new Date(`${hourKey}:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCDay()}-${date.getUTCHours()}`;
}

export function TimelinePage({ analysisId }: TimelinePageProps) {
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

  return (
    <section className="analytics-page" aria-labelledby="timeline-heading">
      <div className="section-heading-row">
        <div><p className="eyebrow">PREAGGREGATED ACTIVITY</p><h2 id="timeline-heading">Timeline</h2></div>
        <div className="filter-row">
          <label className="filter-control"><span>Bucket</span><select aria-label="Timeline bucket" value={kind} onChange={(event) => setKind(event.target.value as TimelineKind)}>{['hour','day','week','month','year'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="filter-control"><span>Metric</span><select aria-label="Timeline metric" value={measure} onChange={(event) => setMeasure(event.target.value as TimelineMeasure)}><option value="visibleTokens">Tokens</option><option value="messages">Messages</option><option value="conversations">Conversations</option></select></label>
        </div>
      </div>
      <div className="timeline-bars" role="list" aria-label={`${kind} timeline`}>
        {points.map((point) => <div className="timeline-row" role="listitem" key={point.key}><span>{point.key}</span><strong>{point[measure].toLocaleString()}</strong></div>)}
        {points.length === 0 ? <p className="data-note">No dated timeline metrics are stored for this analysis.</p> : null}
      </div>
      <article className="analytics-panel">
        <h3>Weekday / hour heatmap summary</h3>
        <p className="data-note">Top UTC weekday/hour slots by visible tokens, derived from hourly aggregates.</p>
        <div className="heatmap-summary">{heatmap.map(([key, value]) => { const [day, hour] = key.split('-'); return <span className="heat-cell" key={key}>D{day} {hour?.padStart(2,'0')}:00 · {value.toLocaleString()}</span>; })}</div>
      </article>
    </section>
  );
}
