import { useState } from 'react';
import type { CostAssumptions } from '../../analysis/pricing';
import { formatMessage, useI18n } from '../../i18n';

export interface CostScenarioRequest {
  replacementModelId: string;
  assumptions: CostAssumptions;
}

interface CostScenarioEditorProps {
  modelIds: readonly string[];
  onCalculate(request: CostScenarioRequest): void | Promise<void>;
}

function ratio(value: string, label: string, errorTemplate: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new RangeError(formatMessage(errorTemplate, { label }));
  }
  return parsed;
}

export function CostScenarioEditor({ modelIds, onCalculate }: CostScenarioEditorProps) {
  const { t } = useI18n();
  const [replacementModelId, setReplacementModelId] = useState(modelIds[0] ?? '');
  const [cacheRatio, setCacheRatio] = useState('0');
  const [hiddenInputOverheadRatio, setHiddenInputOverheadRatio] = useState('0.2');
  const [reasoningOutputOverheadRatio, setReasoningOutputOverheadRatio] = useState('0.2');
  const [error, setError] = useState<string>();

  return (
    <section className="panel" aria-labelledby="scenario-heading">
      <h3 id="scenario-heading">{t('costScenario.title')}</h3>
      <p className="muted-copy">{t('costScenario.description')}</p>
      <div className="form-grid">
        <label>
          <span>{t('costScenario.modelSubstitution')}</span>
          <select value={replacementModelId} onChange={(event) => setReplacementModelId(event.target.value)}>
            {modelIds.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
          </select>
        </label>
        <label>
          <span>{t('costScenario.cacheRatio')}</span>
          <input aria-label={t('costScenario.cacheRatio')} inputMode="decimal" value={cacheRatio} onChange={(event) => setCacheRatio(event.target.value)} />
        </label>
        <label>
          <span>{t('costScenario.hiddenInputOverhead')}</span>
          <input aria-label={t('costScenario.hiddenInputOverhead')} inputMode="decimal" value={hiddenInputOverheadRatio} onChange={(event) => setHiddenInputOverheadRatio(event.target.value)} />
        </label>
        <label>
          <span>{t('costScenario.reasoningOutputOverhead')}</span>
          <input aria-label={t('costScenario.reasoningOutputOverhead')} inputMode="decimal" value={reasoningOutputOverheadRatio} onChange={(event) => setReasoningOutputOverheadRatio(event.target.value)} />
        </label>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <button
        className="primary-action"
        type="button"
        onClick={() => {
          try {
            const assumptions: CostAssumptions = {
              cacheRatio: ratio(cacheRatio, t('costScenario.cacheRatio'), t('costScenario.ratioError')),
              hiddenInputOverheadRatio: ratio(hiddenInputOverheadRatio, t('costScenario.hiddenInputOverhead'), t('costScenario.ratioError')),
              reasoningOutputOverheadRatio: ratio(reasoningOutputOverheadRatio, t('costScenario.reasoningOutputOverhead'), t('costScenario.ratioError'))
            };
            if (!replacementModelId) throw new Error(t('costScenario.chooseModel'));
            setError(undefined);
            void onCalculate({ replacementModelId, assumptions });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : t('costScenario.invalidInputs'));
          }
        }}
      >
        {t('costScenario.calculate')}
      </button>
    </section>
  );
}
