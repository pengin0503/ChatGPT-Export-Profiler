import type { MetricProvenance } from '../analysis/domain';
import { useI18n } from '../i18n';

interface MetricBadgeProps {
  label: string;
  value: string;
  provenance: MetricProvenance;
  detail?: string;
}

export function MetricBadge({ label, value, provenance, detail }: MetricBadgeProps) {
  const { t } = useI18n();
  const provenanceLabel = provenance === 'observed'
    ? t('provenance.observed')
    : provenance === 'calculated'
      ? t('provenance.calculated')
      : t('provenance.estimated');

  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className={`provenance provenance-${provenance}`}>{provenanceLabel}</span>
      {detail ? <small className="metric-detail">{detail}</small> : null}
    </article>
  );
}
