import { useEffect, useRef, type ChangeEvent } from 'react';
import { useI18n } from '../../i18n';
import { ImportProgress } from './ImportProgress';
import { RecoveryPrompt } from './RecoveryPrompt';
import {
  useImportSession,
  type ImportSessionModel,
  type ImportSummary
} from './useImportSession';

export interface ImportPageProps {
  session?: ImportSessionModel;
  onComplete?(analysisId: string, summary: ImportSummary): void;
}

export function ImportPage({ session, onComplete }: ImportPageProps) {
  const liveSession = useImportSession({ enabled: session === undefined });
  const model = session ?? liveSession;
  const { t } = useI18n();
  const completedAnalysis = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (model.state.status !== 'complete') return;
    if (completedAnalysis.current === model.state.analysisId) return;
    completedAnalysis.current = model.state.analysisId;
    onComplete?.(model.state.analysisId, model.state.summary);
  }, [model.state, onComplete]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) void model.selectFile(file);
    event.currentTarget.value = '';
  };

  const showPicker = !['running', 'duplicate', 'complete'].includes(model.state.status);

  return (
    <div className="import-page">
      <section className="privacy-card" aria-label="Privacy">
        <span className="privacy-dot" aria-hidden="true" />
        <p data-testid="privacy-copy">{t('privacy.local')}</p>
      </section>

      {model.state.status === 'running' ? (
        <ImportProgress state={model.state} onCancel={model.cancel} />
      ) : null}

      {model.state.status === 'duplicate' ? (
        <section className="import-state-card" aria-labelledby="duplicate-heading">
          <p className="eyebrow">EXISTING ANALYSIS</p>
          <h2 id="duplicate-heading">{t('import.duplicate')}</h2>
          <p>{t('import.duplicateDetail')}</p>
          <div className="action-row">
            <button type="button" className="primary-action" onClick={() => void model.openExisting()}>
              {t('import.openExisting')}
            </button>
            <button type="button" className="secondary-action" onClick={() => void model.reanalyze()}>
              {t('import.reanalyze')}
            </button>
          </div>
        </section>
      ) : null}

      {model.state.status === 'recoverable' ? <RecoveryPrompt checkpoint={model.state.checkpoint} /> : null}
      {model.state.status === 'cancelled' ? (
        <RecoveryPrompt checkpoint={model.state.checkpoint} cancelled />
      ) : null}

      {model.state.status === 'failed' ? (
        <section className="import-state-card import-error" role="alert">
          <p className="eyebrow">IMPORT BLOCKED</p>
          <h2>{model.state.code === 'ZIP_SAFETY_BLOCKED' ? t('import.safetyBlocked') : t('import.failed')}</h2>
          <p>{model.state.messageKey}</p>
        </section>
      ) : null}

      {model.state.status === 'complete' ? (
        <section className="import-state-card" aria-labelledby="complete-heading">
          <p className="eyebrow">COMPLETE</p>
          <h2 id="complete-heading">{t('import.complete')}</h2>
          <p>
            {model.state.summary.conversations} conversations · {model.state.summary.messages} messages ·{' '}
            {model.state.summary.visibleTokens} visible tokens
          </p>
        </section>
      ) : null}

      {showPicker ? (
        <section className="empty-state" aria-labelledby="import-heading">
          <div className="empty-state-icon" aria-hidden="true">ZIP</div>
          <div>
            <h2 id="import-heading">{model.state.status === 'inspecting' ? t('import.inspecting') : t('import.action')}</h2>
            <p>{t('import.empty')}</p>
          </div>
          <label className="file-picker primary-action">
            <span>{t('import.fileLabel')}</span>
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label={t('import.fileLabel')}
              onChange={onFileChange}
              disabled={model.state.status === 'inspecting'}
            />
          </label>
        </section>
      ) : null}
    </div>
  );
}
