import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatMessage, useI18n } from '../../i18n';
import type { ConversationMetricRecord } from '../../storage/db';

interface ConversationTableProps {
  rows: ConversationMetricRecord[];
  total: number;
  onSelect(row: ConversationMetricRecord): void;
}

export function ConversationTable({ rows, total, onSelect }: ConversationTableProps) {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 8
  });
  const summary = formatMessage(t('conversations.summary'), {
    shown: rows.length.toLocaleString(),
    total: total.toLocaleString()
  });

  return (
    <div className="conversation-table-shell">
      <div className="table-summary">{summary}</div>
      <div className="virtual-table" role="table" aria-label={t('conversations.tableAria')}>
        <div className="virtual-row virtual-header" role="row">
          <span role="columnheader">{t('conversations.title')}</span>
          <span role="columnheader">{t('conversations.models')}</span>
          <span role="columnheader">{t('conversations.messages')}</span>
          <span role="columnheader">{t('conversations.tokens')}</span>
          <span role="columnheader">{t('conversations.signals')}</span>
        </div>
        <div ref={parentRef} className="virtual-scroll">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const signals = [row.hasWeb && 'web', row.hasFiles && 'files', row.hasTools && 'tools'].filter(Boolean).join(', ') || '—';
              return (
                <button
                  className="virtual-row virtual-data-row"
                  role="row"
                  type="button"
                  key={row.conversationId}
                  onClick={() => onSelect(row)}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
                >
                  <span role="cell">{row.title}</span><span role="cell">{row.modelIds.join(', ') || t('conversations.unknown')}</span><span role="cell">{row.messages.toLocaleString()}</span><span role="cell">{row.visibleTokens.toLocaleString()}</span><span role="cell">{signals}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
