import { useI18n } from '../../i18n';
import type { ConversationMetricRecord } from '../../storage/db';

interface ConversationDetailsProps { row: ConversationMetricRecord | null; onClose(): void }

function formatDate(timestamp?: number): string {
  if (timestamp === undefined) return '—';
  const ms = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toISOString();
}

export function ConversationDetails({ row, onClose }: ConversationDetailsProps) {
  const { t } = useI18n();
  if (!row) return null;
  const signals = [
    row.hasWeb && t('conversations.web'),
    row.hasFiles && t('conversations.files'),
    row.hasTools && t('conversations.tools')
  ].filter(Boolean).join(', ') || t('conversations.none');

  return (
    <aside className="details-panel" aria-label={t('conversations.detailsAria')}>
      <div className="section-heading-row"><h3>{row.title}</h3><button type="button" onClick={onClose}>{t('conversations.close')}</button></div>
      <dl className="details-list">
        <div><dt>{t('conversations.id')}</dt><dd>{row.conversationId}</dd></div>
        <div><dt>{t('conversations.dateRange')}</dt><dd>{formatDate(row.firstTimestamp)} – {formatDate(row.lastTimestamp)}</dd></div>
        <div><dt>{t('conversations.models')}</dt><dd>{row.modelIds.join(', ') || t('conversations.unknown')}</dd></div>
        <div><dt>{t('conversations.messages')}</dt><dd>{row.messages.toLocaleString()}</dd></div>
        <div><dt>{t('conversations.visibleTokens')}</dt><dd>{row.visibleTokens.toLocaleString()}</dd></div>
        <div><dt>{t('conversations.inputOutput')}</dt><dd>{row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}</dd></div>
        <div><dt>{t('conversations.signals')}</dt><dd>{signals}</dd></div>
      </dl>
      <p className="data-note">{t('conversations.detailsNote')}</p>
    </aside>
  );
}
