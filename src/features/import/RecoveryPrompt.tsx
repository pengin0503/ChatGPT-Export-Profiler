import type { ImportCheckpoint } from '../../storage/repositories';
import { formatMessage, useI18n } from '../../i18n';
import { stageLabel } from './stageLabel';

export interface RecoveryPromptProps {
  checkpoint?: ImportCheckpoint;
  cancelled?: boolean;
}

export function RecoveryPrompt({ checkpoint, cancelled = false }: RecoveryPromptProps) {
  const { t } = useI18n();
  return (
    <section className="recovery-prompt" aria-labelledby="recovery-heading">
      <p className="eyebrow">{t('import.recoveryEyebrow')}</p>
      <h2 id="recovery-heading">{cancelled ? t('import.cancelled') : t('import.resume')}</h2>
      {checkpoint ? (
        <p className="recovery-detail">
          {t('import.reselect')}<br />
          {formatMessage(t('import.saved'), { count: checkpoint.processedConversations, stage: stageLabel(t, checkpoint.stage) })}
        </p>
      ) : (
        <p className="recovery-detail">{t('import.noCheckpoint')}</p>
      )}
    </section>
  );
}
