import type { ImportSessionState } from './useImportSession';

export interface ImportProgressProps {
  state: Extract<ImportSessionState, { status: 'running' }>;
  onCancel(): void;
}

export function ImportProgress({ state, onCancel }: ImportProgressProps) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));

  return (
    <section className="import-progress" aria-live="polite" aria-labelledby="import-progress-heading">
      <div>
        <p className="eyebrow">PROCESSING</p>
        <h2 id="import-progress-heading">Local analysis in progress</h2>
      </div>
      <dl className="progress-metrics">
        <div>
          <dt>Stage</dt>
          <dd>{state.stage}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{state.processedConversations} conversations processed</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{elapsedSeconds}s</dd>
        </div>
      </dl>
      {state.warnings.length > 0 ? (
        <div className="warning-panel">
          <strong>Warnings</strong>
          <ul>
            {state.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" className="secondary-action" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
