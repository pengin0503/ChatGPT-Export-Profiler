import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMessage, useI18n } from '../../i18n';
import { analysisRepository, type AnalysisRecord } from '../../storage/repositories';

interface StoragePanelProps {
  analysisId?: string;
  protectedAnalysisId?: string;
  onAnalysisDeleted?(): void;
}

function formatBytes(value: number | undefined, unknownLabel: string): string {
  if (value === undefined) return unknownLabel;
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
  const { t } = useI18n();
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
    setStatus(id === analysisId ? t('settings.storage.deletedCurrent') : t('settings.storage.deletedStored'));
    if (id === analysisId) onAnalysisDeleted?.();
    await refresh();
  }

  const unknown = t('settings.storage.unknown');

  return (
    <section className="panel" aria-labelledby="storage-heading">
      <h3 id="storage-heading">{t('settings.storage.title')}</h3>
      <p className="muted-copy">{formatMessage(t('settings.storage.usage'), {
        usage: formatBytes(usage, unknown),
        quota: formatBytes(quota, unknown)
      })}</p>
      {protectedAnalysisId ? (
        <p className="muted-copy">{t('settings.storage.protected')}</p>
      ) : null}
      {analysisId && analysisId !== protectedAnalysisId ? (
        <button
          type="button"
          className="danger-action"
          onClick={() => void removeAnalysis(analysisId)}
        >
          {t('settings.storage.deleteCurrent')}
        </button>
      ) : null}
      <div className="storage-analysis-list">
        <h4>{t('settings.storage.prior')}</h4>
        {priorAnalyses.length === 0 ? (
          <p className="muted-copy">{t('settings.storage.none')}</p>
        ) : (
          <ul className="compact-list">
            {priorAnalyses.map((analysis, index) => (
              <li key={analysis.id}>
                <span>{analysis.status === 'complete' ? t('settings.storage.completed') : t('settings.storage.incomplete')}</span>{' '}
                <button
                  type="button"
                  className="danger-action"
                  aria-label={formatMessage(t('settings.storage.deleteStoredAria'), { index: index + 1 })}
                  onClick={() => void removeAnalysis(analysis.id)}
                >
                  {t('settings.storage.delete')}
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
