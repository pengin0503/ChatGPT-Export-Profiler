import type { ConversationMetricRecord } from '../../storage/db';

interface ConversationDetailsProps { row: ConversationMetricRecord | null; onClose(): void }

function formatDate(timestamp?: number): string {
  if (timestamp === undefined) return '—';
  const ms = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toISOString();
}

export function ConversationDetails({ row, onClose }: ConversationDetailsProps) {
  if (!row) return null;
  return (
    <aside className="details-panel" aria-label="Conversation details">
      <div className="section-heading-row"><h3>{row.title}</h3><button type="button" onClick={onClose}>Close</button></div>
      <dl className="details-list">
        <div><dt>Conversation ID</dt><dd>{row.conversationId}</dd></div>
        <div><dt>Date range</dt><dd>{formatDate(row.firstTimestamp)} – {formatDate(row.lastTimestamp)}</dd></div>
        <div><dt>Models</dt><dd>{row.modelIds.join(', ') || 'unknown'}</dd></div>
        <div><dt>Messages</dt><dd>{row.messages.toLocaleString()}</dd></div>
        <div><dt>Visible tokens</dt><dd>{row.visibleTokens.toLocaleString()}</dd></div>
        <div><dt>Input / output</dt><dd>{row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}</dd></div>
        <div><dt>Signals</dt><dd>{[row.hasWeb && 'web', row.hasFiles && 'files', row.hasTools && 'tools'].filter(Boolean).join(', ') || 'none'}</dd></div>
      </dl>
      <p className="data-note">Full conversation text is not persisted and is not available from this analytics view.</p>
    </aside>
  );
}
