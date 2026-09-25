import type { ImportCheckpoint } from '../storage/repositories';

interface StoragePressureNoticeProps {
  checkpoint: ImportCheckpoint;
  onManageStorage(): void;
  onRetry(): void | Promise<void>;
}

export function StoragePressureNotice({ checkpoint, onManageStorage, onRetry }: StoragePressureNoticeProps) {
  return (
    <section className="import-state-card import-error" role="alert" aria-labelledby="storage-pressure-heading">
      <p className="eyebrow">STORAGE PRESSURE</p>
      <h2 id="storage-pressure-heading">Browser storage is full</h2>
      <p>
        Import paused after {checkpoint.processedConversations.toLocaleString()} conversations. Your durable checkpoint is preserved,
        so the import can resume after storage is freed.
      </p>
      <div className="action-row">
        <button type="button" className="secondary-action" onClick={onManageStorage}>Manage storage</button>
        <button type="button" className="primary-action" onClick={() => void onRetry()}>Retry import</button>
      </div>
    </section>
  );
}
