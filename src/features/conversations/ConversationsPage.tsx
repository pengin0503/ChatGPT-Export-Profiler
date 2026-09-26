import { useEffect, useMemo, useState } from 'react';
import { loadPricingRecords } from '../../analysis/pricingHistory';
import type { PricingRecord } from '../../analysis/pricing';
import { useI18n } from '../../i18n';
import { queryConversationMetrics, type ConversationSort, type DateRange } from '../../storage/analyticsQueries';
import type { ConversationMetricRecord } from '../../storage/db';
import { ConversationDetails } from './ConversationDetails';
import { ConversationTable } from './ConversationTable';

interface ConversationsPageProps { analysisId: string }

const PAGE_SIZE = 500;

function parseDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : undefined;
}

function selectedRange(fromDate: string, toDate: string): DateRange | undefined {
  const from = parseDate(fromDate);
  const toDay = parseDate(toDate);
  if (from === undefined && toDay === undefined) return undefined;
  const to = toDay === undefined ? undefined : toDay + 86_400;
  if (from !== undefined && to !== undefined && to <= from) return { from, to: from };
  return { from, to };
}

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
  const [maxTokens, setMaxTokens] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pricing, setPricing] = useState<PricingRecord[] | null>(null);
  const [selected, setSelected] = useState<ConversationMetricRecord | null>(null);

  useEffect(() => {
    let active = true;
    void loadPricingRecords().then((records) => {
      if (active) setPricing(records);
    });
    return () => { active = false; };
  }, []);

  const range = useMemo(() => selectedRange(fromDate, toDate), [fromDate, toDate]);

  useEffect(() => {
    if (pricing === null) return;
    let active = true;
    const parsedMin = minTokens.trim() ? Number(minTokens) : undefined;
    const parsedMax = maxTokens.trim() ? Number(maxTokens) : undefined;
    void queryConversationMetrics(analysisId, {
      range,
      modelId: modelId.trim() || undefined,
      sort,
      hasWeb: webOnly ? true : undefined,
      hasFiles: filesOnly ? true : undefined,
      hasTools: toolsOnly ? true : undefined,
      minTokens: parsedMin !== undefined && Number.isFinite(parsedMin) ? parsedMin : undefined,
      maxTokens: parsedMax !== undefined && Number.isFinite(parsedMax) ? parsedMax : undefined,
      pricing,
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
  }, [analysisId, modelId, sort, webOnly, filesOnly, toolsOnly, minTokens, maxTokens, range, pricing, page]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const pageCount = Math.max(1, lastPage + 1);
  const currentPage = Math.min(page, lastPage);

  const resetPage = (): void => {
    setPage(0);
    setSelected(null);
  };

  const goToPage = (nextPage: number): void => {
    setPage(Math.max(0, Math.min(lastPage, nextPage)));
    setSelected(null);
  };

  return (
    <section className="analytics-page" aria-labelledby="conversations-heading">
      <p className="eyebrow">{t('conversations.eyebrow')}</p>
      <h2 id="conversations-heading">{t('nav.conversations')}</h2>
      <div className="filter-row wrap">
        <label className="filter-control">
          <span>{t('conversations.model')}</span>
          <input
            aria-label={t('conversations.modelFilterAria')}
            value={modelId}
            onChange={(event) => {
              setModelId(event.target.value);
              resetPage();
            }}
            placeholder="gpt-6-sol"
          />
        </label>
        <label className="filter-control">
          <span>{t('conversations.minimumTokens')}</span>
          <input
            aria-label={t('conversations.minimumTokensAria')}
            inputMode="numeric"
            value={minTokens}
            onChange={(event) => {
              setMinTokens(event.target.value);
              resetPage();
            }}
          />
        </label>
        <label className="filter-control">
          <span>{t('conversations.maximumTokens')}</span>
          <input
            aria-label={t('conversations.maximumTokensAria')}
            inputMode="numeric"
            value={maxTokens}
            onChange={(event) => {
              setMaxTokens(event.target.value);
              resetPage();
            }}
          />
        </label>
        <label className="filter-control">
          <span>{t('conversations.fromDate')}</span>
          <input type="date" aria-label={t('conversations.fromDateAria')} value={fromDate} onChange={(event) => { setFromDate(event.target.value); resetPage(); }} />
        </label>
        <label className="filter-control">
          <span>{t('conversations.toDate')}</span>
          <input type="date" aria-label={t('conversations.toDateAria')} value={toDate} onChange={(event) => { setToDate(event.target.value); resetPage(); }} />
        </label>
        <label className="filter-control">
          <span>{t('conversations.sort')}</span>
          <select
            aria-label={t('conversations.sortAria')}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ConversationSort);
              resetPage();
            }}
          >
            <option value="visibleTokens-desc">{t('conversations.sort.tokensDesc')}</option>
            <option value="inputTokens-desc">{t('conversations.sort.inputDesc')}</option>
            <option value="outputTokens-desc">{t('conversations.sort.outputDesc')}</option>
            <option value="messages-desc">{t('conversations.sort.messagesDesc')}</option>
            <option value="cost-desc">{t('conversations.sort.costDesc')}</option>
            <option value="duration-desc">{t('conversations.sort.durationDesc')}</option>
            <option value="newest">{t('conversations.sort.newest')}</option>
            <option value="oldest">{t('conversations.sort.oldest')}</option>
          </select>
        </label>
        <label className="check-filter"><input type="checkbox" checked={webOnly} onChange={(event) => { setWebOnly(event.target.checked); resetPage(); }} /> {t('conversations.web')}</label>
        <label className="check-filter"><input type="checkbox" checked={filesOnly} onChange={(event) => { setFilesOnly(event.target.checked); resetPage(); }} /> {t('conversations.files')}</label>
        <label className="check-filter"><input type="checkbox" checked={toolsOnly} onChange={(event) => { setToolsOnly(event.target.checked); resetPage(); }} /> {t('conversations.tools')}</label>
      </div>
      <div className="conversation-layout">
        <div>
          <ConversationTable rows={rows} total={total} onSelect={setSelected} />
          {total > PAGE_SIZE ? (
            <nav className="pagination-controls" aria-label={t('conversations.pagesAria')}>
              <button type="button" className="secondary-action" aria-label="«" disabled={currentPage === 0} onClick={() => goToPage(0)}>«</button>
              <button type="button" className="secondary-action" aria-label="‹" disabled={currentPage === 0} onClick={() => goToPage(currentPage - 1)}>‹</button>
              <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
              <button type="button" className="secondary-action" aria-label="›" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>›</button>
              <button type="button" className="secondary-action" aria-label="»" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>»</button>
            </nav>
          ) : null}
        </div>
        <ConversationDetails row={selected} onClose={() => setSelected(null)} />
      </div>
    </section>
  );
}
