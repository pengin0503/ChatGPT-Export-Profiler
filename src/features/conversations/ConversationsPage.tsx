import { useEffect, useState } from 'react';
import type { ConversationMetricRecord } from '../../storage/db';
import { queryConversationMetrics, type ConversationSort } from '../../storage/analyticsQueries';
import { ConversationDetails } from './ConversationDetails';
import { ConversationTable } from './ConversationTable';

interface ConversationsPageProps { analysisId: string }

export function ConversationsPage({ analysisId }: ConversationsPageProps) {
  const [rows, setRows] = useState<ConversationMetricRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [modelId, setModelId] = useState('');
  const [sort, setSort] = useState<ConversationSort>('visibleTokens-desc');
  const [webOnly, setWebOnly] = useState(false);
  const [filesOnly, setFilesOnly] = useState(false);
  const [toolsOnly, setToolsOnly] = useState(false);
  const [minTokens, setMinTokens] = useState('');
  const [selected, setSelected] = useState<ConversationMetricRecord | null>(null);

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
      offset: 0,
      limit: 10_000
    }).then((result) => {
      if (!active) return;
      setRows(result.rows);
      setTotal(result.total);
    });
    return () => { active = false; };
  }, [analysisId, modelId, sort, webOnly, filesOnly, toolsOnly, minTokens]);

  return (
    <section className="analytics-page" aria-labelledby="conversations-heading">
      <p className="eyebrow">DERIVED METRICS ONLY</p>
      <h2 id="conversations-heading">Conversations</h2>
      <div className="filter-row wrap">
        <label className="filter-control"><span>Model</span><input aria-label="Conversation model filter" value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="gpt-6-sol" /></label>
        <label className="filter-control"><span>Minimum tokens</span><input aria-label="Minimum tokens" inputMode="numeric" value={minTokens} onChange={(event) => setMinTokens(event.target.value)} /></label>
        <label className="filter-control"><span>Sort</span><select aria-label="Conversation sort" value={sort} onChange={(event) => setSort(event.target.value as ConversationSort)}><option value="visibleTokens-desc">Tokens ↓</option><option value="inputTokens-desc">Input ↓</option><option value="outputTokens-desc">Output ↓</option><option value="messages-desc">Messages ↓</option><option value="duration-desc">Duration ↓</option><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label>
        <label className="check-filter"><input type="checkbox" checked={webOnly} onChange={(event) => setWebOnly(event.target.checked)} /> Web</label>
        <label className="check-filter"><input type="checkbox" checked={filesOnly} onChange={(event) => setFilesOnly(event.target.checked)} /> Files</label>
        <label className="check-filter"><input type="checkbox" checked={toolsOnly} onChange={(event) => setToolsOnly(event.target.checked)} /> Tools</label>
      </div>
      <div className="conversation-layout">
        <ConversationTable rows={rows} total={total} onSelect={setSelected} />
        <ConversationDetails row={selected} onClose={() => setSelected(null)} />
      </div>
    </section>
  );
}
