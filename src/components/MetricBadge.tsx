import type { MetricProvenance } from '../analysis/domain';

interface MetricBadgeProps {
  label: string;
  value: string;
  provenance: MetricProvenance;
  detail?: string;
}

export function MetricBadge({ label, value, provenance, detail }: MetricBadgeProps) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className={`provenance provenance-${provenance}`}>{provenance}</span>
      {detail ? <small className="metric-detail">{detail}</small> : null}
    </article>
  );
}
