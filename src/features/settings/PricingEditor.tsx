import { useEffect, useState } from 'react';
import { BUILT_IN_PRICING_V1 } from '../../data/pricing.v1';
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

function nonNegative(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new RangeError('Prices must be non-negative.');
  return parsed;
}

export function PricingEditor() {
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
      if (!trimmedModel) throw new Error('Model ID is required.');
      if (!effectiveFrom || !Number.isFinite(Date.parse(`${effectiveFrom}T00:00:00Z`))) throw new Error('A valid effective date is required.');
      const value: LocalPricingValue = {
        model: trimmedModel,
        effectiveFrom,
        effectiveTo: null,
        inputPerMillion: nonNegative(input),
        cachedInputPerMillion: nonNegative(cached),
        outputPerMillion: nonNegative(output),
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
      setStatus('Saved local override.');
    } catch (caught) {
      setStatus(undefined);
      setError(caught instanceof Error ? caught.message : 'Unable to save local pricing override.');
    }
  }

  return (
    <section className="panel" aria-labelledby="pricing-editor-heading">
      <h3 id="pricing-editor-heading">Local pricing overrides</h3>
      <p className="muted-copy">Overrides are stored separately from the {BUILT_IN_PRICING_V1.length} built-in pricing records.</p>
      <div className="form-grid">
        <label><span>Model ID</span><input aria-label="Model ID" value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label><span>Effective from</span><input aria-label="Effective from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
        <label><span>Input per million</span><input aria-label="Input per million" inputMode="decimal" value={input} onChange={(event) => setInput(event.target.value)} /></label>
        <label><span>Cached input per million</span><input aria-label="Cached input per million" inputMode="decimal" value={cached} onChange={(event) => setCached(event.target.value)} /></label>
        <label><span>Output per million</span><input aria-label="Output per million" inputMode="decimal" value={output} onChange={(event) => setOutput(event.target.value)} /></label>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {status ? <p className="success-note" role="status">{status}</p> : null}
      <button className="primary-action" type="button" onClick={() => void save()}>Save local override</button>
      {records.length ? (
        <ul className="compact-list" aria-label="Local pricing history">
          {records.map((record) => {
            const value = record.value as Partial<LocalPricingValue>;
            return <li key={record.key}>{String(value.model ?? 'unknown')} · {String(value.effectiveFrom ?? 'unknown date')}</li>;
          })}
        </ul>
      ) : null}
    </section>
  );
}
