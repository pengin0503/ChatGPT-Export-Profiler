import { useCallback, useEffect, useMemo, useState } from 'react';
import { analysisRepository, type AnalysisRecord } from '../../storage/repositories';

interface StoragePanelProps {
  analysisId?: string;
  protectedAnalysisId?: string;
  onAnalysisDeleted?(): void;
}

function formatBytes(value?: number): string {
  if (value === undefined) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function StoragePanel({ analysisId, protectedAnalysisId, onAnalysisDeleted }: StoragePanelProps) {
  const [usage, setUsage] = useState<number>();
  const [quota, setQuota] = useState<number>();
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [status, setStatus] = useState<string>();

  const refresh = useCallback(async (): Promise<void> => {
    const [stored, estimate] = await Promise.all([
      analysisRepository.list(),
      navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(undefined)
    ]);
    setAnalyses(stored);
    setUsage(estimate?.usage);
    setQuota(estimate?.quota);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      analysisRepository.list(),
      navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(undefined)
    ]).then(([stored, estimate]) => {
      if (!active) return;
      setAnalyses(stored);
      setUsage(estimate?.usage);
      setQuota(estimate?.quota);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const priorAnalyses = useMemo(
    () => analyses.filter((analysis) => analysis.id !== analysisId && analysis.id !== protectedAnalysisId),
    [analyses, analysisId, protectedAnalysisId]
  );

  async function removeAnalysis(id: string): Promise<void> {
    await analysisRepository.delete(id);
    setStatus(id === analysisId ? 'Deleted the current local analysis.' : 'Deleted a stored local analysis.');
    if (id === analysisId) onAnalysisDeleted?.();
    await refresh();
  }

  return (
    <section className="panel" aria-labelledby="storage-heading">
      <h3 id="storage-heading">Storage</h3>
      <p className="muted-copy">Browser storage: {formatBytes(usage)} used of {formatBytes(quota)} available quota.</p>
      {protectedAnalysisId ? (
        <p className="muted-copy">The paused import and its durable checkpoint are protected while you remove older analyses.</p>
      ) : null}
      {analysisId && analysisId !== protectedAnalysisId ? (
        <button
          type="button"
          className="danger-action"
          onClick={() => void removeAnalysis(analysisId)}
        >
          Delete current analysis
        </button>
      ) : null}
      <div className="storage-analysis-list">
        <h4>Stored prior analyses</h4>
        {priorAnalyses.length === 0 ? (
          <p className="muted-copy">No other stored analyses are available to delete.</p>
        ) : (
          <ul className="compact-list">
            {priorAnalyses.map((analysis, index) => (
              <li key={analysis.id}>
                <span>{analysis.status === 'complete' ? 'Completed' : 'Incomplete'} local analysis</span>{' '}
                <button
                  type="button"
                  className="danger-action"
                  aria-label={`Delete stored analysis ${index + 1}`}
                  onClick={() => void removeAnalysis(analysis.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {status ? <p className="success-note" role="status">{status}</p> : null}
    </section>
  );
}
