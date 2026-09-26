import { useEffect, useState } from 'react';
import { BUILT_IN_PRICING_V1 } from '../../data/pricing.v1';
import { formatMessage, useI18n } from '../../i18n';
import { openProfilerDb, type KeyValueRecord } from '../../storage/db';

interface LocalPricingValue extends Record<string, unknown> {
  model: string;
  effectiveFrom: string;
  effectiveTo: null;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  currency: 'USD';
  datasetVersion: number;
  source: 'local user override';
}

function nonNegative(value: string, message: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new RangeError(message);
  return parsed;
}

export function PricingEditor() {
  const { t } = useI18n();
  const [model, setModel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [input, setInput] = useState('');
  const [cached, setCached] = useState('');
  const [output, setOutput] = useState('');
  const [records, setRecords] = useState<KeyValueRecord[]>([]);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void openProfilerDb().then(async (db) => {
      try {
        const values = await db.getAll('pricingHistory');
        if (active) setRecords(values);
      } finally {
        db.close();
      }
    });
    return () => { active = false; };
  }, []);

  async function save(): Promise<void> {
    try {
      const trimmedModel = model.trim();
      if (!trimmedModel) throw new Error(t('settings.pricing.modelRequired'));
      if (!effectiveFrom || !Number.isFinite(Date.parse(`${effectiveFrom}T00:00:00Z`))) {
        throw new Error(t('settings.pricing.dateRequired'));
      }
      const nonNegativeMessage = t('settings.pricing.nonNegative');
      const value: LocalPricingValue = {
        model: trimmedModel,
        effectiveFrom,
        effectiveTo: null,
        inputPerMillion: nonNegative(input, nonNegativeMessage),
        cachedInputPerMillion: nonNegative(cached, nonNegativeMessage),
        outputPerMillion: nonNegative(output, nonNegativeMessage),
        currency: 'USD',
        datasetVersion: 1,
        source: 'local user override'
      };
      const record: KeyValueRecord = { key: `override:${trimmedModel}:${effectiveFrom}`, value };
      const db = await openProfilerDb();
      try {
        await db.put('pricingHistory', record);
        setRecords(await db.getAll('pricingHistory'));
      } finally {
        db.close();
      }
      setError(undefined);
      setStatus(t('settings.pricing.saved'));
    } catch (caught) {
      setStatus(undefined);
      setError(caught instanceof Error ? caught.message : t('settings.pricing.saveFailed'));
    }
  }

  return (
    <section className="panel" aria-labelledby="pricing-editor-heading">
      <h3 id="pricing-editor-heading">{t('settings.pricing.title')}</h3>
      <p className="muted-copy">{formatMessage(t('settings.pricing.description'), { count: BUILT_IN_PRICING_V1.length })}</p>
      <div className="form-grid">
        <label><span>{t('settings.pricing.model')}</span><input aria-label={t('settings.pricing.model')} value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label><span>{t('settings.pricing.effectiveFrom')}</span><input aria-label={t('settings.pricing.effectiveFrom')} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
        <label><span>{t('settings.pricing.input')}</span><input aria-label={t('settings.pricing.input')} inputMode="decimal" value={input} onChange={(event) => setInput(event.target.value)} /></label>
        <label><span>{t('settings.pricing.cachedInput')}</span><input aria-label={t('settings.pricing.cachedInput')} inputMode="decimal" value={cached} onChange={(event) => setCached(event.target.value)} /></label>
        <label><span>{t('settings.pricing.output')}</span><input aria-label={t('settings.pricing.output')} inputMode="decimal" value={output} onChange={(event) => setOutput(event.target.value)} /></label>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {status ? <p className="success-note" role="status">{status}</p> : null}
      <button className="primary-action" type="button" onClick={() => void save()}>{t('settings.pricing.save')}</button>
      {records.length ? (
        <ul className="compact-list" aria-label={t('settings.pricing.historyAria')}>
          {records.map((record) => {
            const value = record.value as Partial<LocalPricingValue>;
            return <li key={record.key}>{String(value.model ?? t('settings.pricing.unknownModel'))} · {String(value.effectiveFrom ?? t('settings.pricing.unknownDate'))}</li>;
          })}
        </ul>
      ) : null}
    </section>
  );
}
