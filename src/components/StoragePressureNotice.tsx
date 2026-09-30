import type { ImportCheckpoint } from '../storage/repositories';
import { formatMessage, useI18n } from '../i18n';

interface StoragePressureNoticeProps {
  checkpoint: ImportCheckpoint;
  onManageStorage(): void;
  onRetry(): void | Promise<void>;
}

export function StoragePressureNotice({ checkpoint, onManageStorage, onRetry }: StoragePressureNoticeProps) {
  const { t, locale } = useI18n();
  return (
    <section className="import-state-card import-error" role="alert" aria-labelledby="storage-pressure-heading">
      <p className="eyebrow">{t('import.storageEyebrow')}</p>
      <h2 id="storage-pressure-heading">{t('import.storageHeading')}</h2>
      <p>
        {formatMessage(t('import.storagePaused'), { count: checkpoint.processedConversations.toLocaleString(locale) })}
      </p>
      <div className="action-row">
        <button type="button" className="secondary-action" onClick={onManageStorage}>{t('import.manageStorage')}</button>
        <button type="button" className="primary-action" onClick={() => void onRetry()}>{t('import.retry')}</button>
      </div>
    </section>
  );
}
