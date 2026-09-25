import { useEffect, useState } from 'react';
import { openProfilerDb } from '../../storage/db';

interface StoragePanelProps {
  analysisId?: string;
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

async function deleteAnalysis(analysisId: string): Promise<void> {
  const db = await openProfilerDb();
  try {
    const conversationKeys = await db.getAllKeysFromIndex('conversations', 'by-analysis', analysisId);
    const metricKeys = await db.getAllKeysFromIndex('conversationMetrics', 'by-analysis', analysisId);
    const modelKeys = await db.getAllKeysFromIndex('modelMetrics', 'by-analysis', analysisId);
    const timelineKeys = await db.getAllKeysFromIndex('timelineMetrics', 'by-analysis', analysisId);
    const toolKeys = await db.getAllKeysFromIndex('toolMetrics', 'by-analysis', analysisId);
    const tx = db.transaction(
      ['analyses', 'conversations', 'conversationMetrics', 'modelMetrics', 'timelineMetrics', 'toolMetrics', 'dataQuality', 'checkpoints'],
      'readwrite'
    );
    for (const key of conversationKeys) await tx.objectStore('conversations').delete(key);
    for (const key of metricKeys) await tx.objectStore('conversationMetrics').delete(key);
    for (const key of modelKeys) await tx.objectStore('modelMetrics').delete(key);
    for (const key of timelineKeys) await tx.objectStore('timelineMetrics').delete(key);
    for (const key of toolKeys) await tx.objectStore('toolMetrics').delete(key);
    await tx.objectStore('analyses').delete(analysisId);
    await tx.objectStore('dataQuality').delete(analysisId);
    await tx.objectStore('checkpoints').delete(analysisId);
    await tx.done;
  } finally {
    db.close();
  }
}

export function StoragePanel({ analysisId, onAnalysisDeleted }: StoragePanelProps) {
  const [usage, setUsage] = useState<number>();
  const [quota, setQuota] = useState<number>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    let active = true;
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((estimate) => {
        if (!active) return;
        setUsage(estimate.usage);
        setQuota(estimate.quota);
      });
    }
    return () => { active = false; };
  }, []);

  return (
    <section className="panel" aria-labelledby="storage-heading">
      <h3 id="storage-heading">Storage</h3>
      <p className="muted-copy">Browser storage: {formatBytes(usage)} used of {formatBytes(quota)} available quota.</p>
      {analysisId ? (
        <button
          type="button"
          className="danger-action"
          onClick={() => {
            void deleteAnalysis(analysisId).then(() => {
              setStatus('Deleted the current local analysis.');
              onAnalysisDeleted?.();
            });
          }}
        >
          Delete current analysis
        </button>
      ) : <p className="muted-copy">No active analysis is selected.</p>}
      {status ? <p className="success-note" role="status">{status}</p> : null}
    </section>
  );
}
