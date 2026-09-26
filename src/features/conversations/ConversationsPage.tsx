import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { queryConversationMetrics, type ConversationSort } from '../../storage/analyticsQueries';
import type { ConversationMetricRecord } from '../../storage/db';
import { ConversationDetails } from './ConversationDetails';
import { ConversationTable } from './ConversationTable';

interface ConversationsPageProps { analysisId: string }

const PAGE_SIZE = 500;

export function ConversationsPage({ analysisId }: ConversationsPageProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ConversationMetricRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [modelId, setModelId] = useState('');
  const [sort, setSort] = useState<ConversationSort>('visibleTokens-desc');
  const [webOnly, setWebOnly] = useState(false);
  const [filesOnly, setFilesOnly] = useState(false);
  const [toolsOnly, setToolsOnly] = useState(false);
  const [minTokens, setMinTokens] = useState('');
  const [selected, setSelected] = useState<ConversationMetricRecord | null>(null);

  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [analysisId, modelId, sort, webOnly, filesOnly, toolsOnly, minTokens]);

  useEffect(() => {
    let active = true;
    const parsedMin = minTokens.trim() ? Number(minTokens) : undefined;
    void queryConversationMetrics(analysisId, {
      modelId: modelId.trim() || undefined,
      sort,
      hasWeb: webOnly ? true : undefined,
      hasFiles: filesOnly ? true : undefined,
      hasTools: toolsOnly ? true : undefined,
      minTokens: parsedMin !== undefined && Number.isFinite(parsedMin) ? parsedMin : undefined,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE
    }).then((result) => {
      if (!active) return;
      const lastPage = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
    });
    return () => { active = false; };
  }, [analysisId, modelId, sort, webOnly, filesOnly, toolsOnly, minTokens, page]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const pageCount = Math.max(1, lastPage + 1);
  const currentPage = Math.min(page, lastPage);

  return (
    <section className="analytics-page" aria-labelledby="conversations-heading">
      <p className="eyebrow">{t('conversations.eyebrow')}</p>
      <h2 id="conversations-heading">{t('nav.conversations')}</h2>
      <div className="filter-row wrap">
        <label className="filter-control">
          <span>{t('conversations.model')}</span>
          <input aria-label={t('conversations.modelFilterAria')} value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="gpt-6-sol" />
        </label>
        <label className="filter-control">
          <span>{t('conversations.minimumTokens')}</span>
          <input aria-label={t('conversations.minimumTokensAria')} inputMode="numeric" value={minTokens} onChange={(event) => setMinTokens(event.target.value)} />
        </label>
        <label className="filter-control">
          <span>{t('conversations.sort')}</span>
          <select aria-label={t('conversations.sortAria')} value={sort} onChange={(event) => setSort(event.target.value as ConversationSort)}>
            <option value="visibleTokens-desc">{t('conversations.sort.tokensDesc')}</option>
            <option value="inputTokens-desc">{t('conversations.sort.inputDesc')}</option>
            <option value="outputTokens-desc">{t('conversations.sort.outputDesc')}</option>
            <option value="messages-desc">{t('conversations.sort.messagesDesc')}</option>
            <option value="duration-desc">{t('conversations.sort.durationDesc')}</option>
            <option value="newest">{t('conversations.sort.newest')}</option>
            <option value="oldest">{t('conversations.sort.oldest')}</option>
          </select>
        </label>
        <label className="check-filter"><input type="checkbox" checked={webOnly} onChange={(event) => setWebOnly(event.target.checked)} /> {t('conversations.web')}</label>
        <label className="check-filter"><input type="checkbox" checked={filesOnly} onChange={(event) => setFilesOnly(event.target.checked)} /> {t('conversations.files')}</label>
        <label className="check-filter"><input type="checkbox" checked={toolsOnly} onChange={(event) => setToolsOnly(event.target.checked)} /> {t('conversations.tools')}</label>
      </div>
      <div className="conversation-layout">
        <div>
          <ConversationTable rows={rows} total={total} onSelect={setSelected} />
          {total > PAGE_SIZE ? (
            <nav className="pagination-controls" aria-label="Conversation pages">
              <button type="button" className="secondary-action" aria-label="«" disabled={currentPage === 0} onClick={() => setPage(0)}>«</button>
              <button type="button" className="secondary-action" aria-label="‹" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>‹</button>
              <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
              <button type="button" className="secondary-action" aria-label="›" disabled={currentPage >= lastPage} onClick={() => setPage((value) => Math.min(lastPage, value + 1))}>›</button>
              <button type="button" className="secondary-action" aria-label="»" disabled={currentPage >= lastPage} onClick={() => setPage(lastPage)}>»</button>
            </nav>
          ) : null}
        </div>
        <ConversationDetails row={selected} onClose={() => setSelected(null)} />
      </div>
    </section>
  );
}
