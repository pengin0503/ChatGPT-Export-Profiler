import { useState } from 'react';
import type { CostAssumptions } from '../../analysis/pricing';

export interface CostScenarioRequest {
  replacementModelId: string;
  assumptions: CostAssumptions;
}

interface CostScenarioEditorProps {
  modelIds: readonly string[];
  onCalculate(request: CostScenarioRequest): void | Promise<void>;
}

function ratio(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
  return parsed;
}

export function CostScenarioEditor({ modelIds, onCalculate }: CostScenarioEditorProps) {
  const [replacementModelId, setReplacementModelId] = useState(modelIds[0] ?? '');
  const [cacheRatio, setCacheRatio] = useState('0');
  const [hiddenInputOverheadRatio, setHiddenInputOverheadRatio] = useState('0.2');
  const [reasoningOutputOverheadRatio, setReasoningOutputOverheadRatio] = useState('0.2');
  const [error, setError] = useState<string>();

  return (
    <section className="panel" aria-labelledby="scenario-heading">
      <h3 id="scenario-heading">Estimated processing scenario</h3>
      <p className="muted-copy">
        These controls are user-selected scenario inputs. They do not describe actual ChatGPT server-side processing.
      </p>
      <div className="form-grid">
        <label>
          <span>Model substitution</span>
          <select value={replacementModelId} onChange={(event) => setReplacementModelId(event.target.value)}>
            {modelIds.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
          </select>
        </label>
        <label>
          <span>Cache ratio</span>
          <input aria-label="Cache ratio" inputMode="decimal" value={cacheRatio} onChange={(event) => setCacheRatio(event.target.value)} />
        </label>
        <label>
          <span>Hidden input overhead</span>
          <input aria-label="Hidden input overhead" inputMode="decimal" value={hiddenInputOverheadRatio} onChange={(event) => setHiddenInputOverheadRatio(event.target.value)} />
        </label>
        <label>
          <span>Reasoning output overhead</span>
          <input aria-label="Reasoning output overhead" inputMode="decimal" value={reasoningOutputOverheadRatio} onChange={(event) => setReasoningOutputOverheadRatio(event.target.value)} />
        </label>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <button
        className="primary-action"
        type="button"
        onClick={() => {
          try {
            const assumptions: CostAssumptions = {
              cacheRatio: ratio(cacheRatio, 'Cache ratio'),
              hiddenInputOverheadRatio: ratio(hiddenInputOverheadRatio, 'Hidden input overhead'),
              reasoningOutputOverheadRatio: ratio(reasoningOutputOverheadRatio, 'Reasoning output overhead')
            };
            if (!replacementModelId) throw new Error('Choose a replacement model.');
            setError(undefined);
            void onCalculate({ replacementModelId, assumptions });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Invalid scenario inputs.');
          }
        }}
      >
        Calculate scenario
      </button>
    </section>
  );
}
