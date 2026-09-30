import { useEffect, useState } from 'react';
import type { ImportSessionState } from './useImportSession';
import { formatMessage, useI18n } from '../../i18n';
import { stageLabel } from './stageLabel';

export interface ImportProgressProps {
  state: Extract<ImportSessionState, { status: 'running' }>;
  onCancel(): void;
}

export function ImportProgress({ state, onCancel }: ImportProgressProps) {
  const { t } = useI18n();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - state.startedAt) / 1000)));
    };
    updateElapsed();
    const timer = globalThis.setInterval(updateElapsed, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [state.startedAt]);

  return (
    <section className="import-progress" aria-live="polite" aria-labelledby="import-progress-heading">
      <div>
        <p className="eyebrow">{t('import.processingEyebrow')}</p>
        <h2 id="import-progress-heading">{t('import.processing')}</h2>
      </div>
      <dl className="progress-metrics">
        <div>
          <dt>{t('import.stage')}</dt>
          <dd>{stageLabel(t, state.stage)}</dd>
        </div>
        <div>
          <dt>{t('import.progress')}</dt>
          <dd>{formatMessage(t('import.processed'), { count: state.processedConversations })}</dd>
        </div>
        <div>
          <dt>{t('import.elapsed')}</dt>
          <dd>{formatMessage(t('import.elapsedSeconds'), { seconds: elapsedSeconds })}</dd>
        </div>
      </dl>
      {state.warnings.length > 0 ? (
        <div className="warning-panel">
          <strong>{t('import.warnings')}</strong>
          <ul>
            {state.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" className="secondary-action" onClick={onCancel}>
        {t('import.cancel')}
      </button>
    </section>
  );
}
