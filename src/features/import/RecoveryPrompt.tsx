import type { ImportCheckpoint } from '../../storage/repositories';

export interface RecoveryPromptProps {
  checkpoint?: ImportCheckpoint;
  cancelled?: boolean;
}

export function RecoveryPrompt({ checkpoint, cancelled = false }: RecoveryPromptProps) {
  return (
    <section className="recovery-prompt" aria-labelledby="recovery-heading">
      <p className="eyebrow">RECOVERY</p>
      <h2 id="recovery-heading">{cancelled ? 'Import cancelled' : 'Resume local analysis'}</h2>
      <p>Re-select the original ZIP to resume from the last committed checkpoint.</p>
      {checkpoint ? (
        <p className="recovery-detail">
          Saved after {checkpoint.processedConversations} conversations · stage {checkpoint.stage}
        </p>
      ) : (
        <p className="recovery-detail">No durable checkpoint is available; selecting a ZIP starts a new analysis.</p>
      )}
    </section>
  );
}
