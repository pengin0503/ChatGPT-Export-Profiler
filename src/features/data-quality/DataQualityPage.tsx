import { useEffect, useState } from 'react';
import { resolveModel } from '../../analysis/modelRegistry';
import { getModelMetrics } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';

interface CoverageView {
  attempted: number;
  identified: number;
  ratio: number | null;
}

interface QualityView {
  fatal: number;
  recoverable: number;
  warning: number;
  unknownSchema: number;
  issues: Array<{ severity: string; code: string }>;
  unknownSchemaKeys: string[];
  modelIdentification: CoverageView;
  tokenization: CoverageView;
  unknownModels: string[];
}

const emptyCoverage = (): CoverageView => ({ attempted: 0, identified: 0, ratio: null });

function parseCoverage(value: unknown): CoverageView {
  if (typeof value !== 'object' || value === null) return emptyCoverage();
  const record = value as Record<string, unknown>;
  return {
    attempted: typeof record.attempted === 'number' ? record.attempted : 0,
    identified: typeof record.identified === 'number' ? record.identified : 0,
    ratio: typeof record.ratio === 'number' ? record.ratio : null
  };
}

function percent(value: CoverageView): string {
  return value.ratio === null ? 'n/a' : `${(value.ratio * 100).toFixed(1)}%`;
}

export function DataQualityPage({ analysisId }: { analysisId: string }) {
  const [view, setView] = useState<QualityView>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      openProfilerDb().then(async (db) => {
        try { return await db.get('dataQuality', analysisId); } finally { db.close(); }
      }),
      getModelMetrics(analysisId)
    ]).then(([qualityRecord, models]) => {
      if (!active) return;
      const value = qualityRecord?.value ?? {};
      const coverage = typeof value.coverage === 'object' && value.coverage !== null ? value.coverage as Record<string, unknown> : {};
      const issues = Array.isArray(value.issues)
        ? value.issues.flatMap((item) => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).code === 'string'
          ? [{ severity: String((item as Record<string, unknown>).severity ?? 'warning'), code: String((item as Record<string, unknown>).code) }]
          : [])
        : [];
      const unknownSchemaKeys = Array.isArray(value.unknownSchemaKeys)
        ? value.unknownSchemaKeys.filter((item): item is string => typeof item === 'string')
        : [];
      const unknownModels = models
        .filter((model) => resolveModel(model.modelId).confidence === 'unknown')
        .map((model) => model.modelId)
        .sort();
      setView({
        fatal: typeof value.fatal === 'number' ? value.fatal : 0,
        recoverable: typeof value.recoverable === 'number' ? value.recoverable : 0,
        warning: typeof value.warning === 'number' ? value.warning : 0,
        unknownSchema: typeof value.unknownSchema === 'number' ? value.unknownSchema : 0,
        issues,
        unknownSchemaKeys,
        modelIdentification: parseCoverage(coverage.modelIdentification),
        tokenization: parseCoverage(coverage.tokenization),
        unknownModels
      });
    });
    return () => { active = false; };
  }, [analysisId]);

  return (
    <section className="analytics-page" aria-labelledby="quality-heading">
      <p className="eyebrow">ANALYSIS RELIABILITY</p>
      <h2 id="quality-heading">Data quality</h2>
      {!view ? <p className="muted-copy">Loading quality metrics…</p> : (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span className="metric-label">Fatal</span><strong className="metric-value">{view.fatal}</strong></article>
            <article className="metric-card"><span className="metric-label">Recoverable</span><strong className="metric-value">{view.recoverable}</strong></article>
            <article className="metric-card"><span className="metric-label">Warnings</span><strong className="metric-value">{view.warning}</strong></article>
            <article className="metric-card"><span className="metric-label">Unknown schema</span><strong className="metric-value">{view.unknownSchema}</strong></article>
          </div>
          <div className="panel-grid">
            <section className="panel"><h3>Coverage</h3><p>Model identification: {percent(view.modelIdentification)} ({view.modelIdentification.identified}/{view.modelIdentification.attempted})</p><p>Tokenization: {percent(view.tokenization)} ({view.tokenization.identified}/{view.tokenization.attempted})</p></section>
            <section className="panel"><h3>Unknown models</h3>{view.unknownModels.length ? <ul className="compact-list">{view.unknownModels.map((model) => <li key={model}>{model}</li>)}</ul> : <p className="muted-copy">None detected.</p>}</section>
            <section className="panel"><h3>Unknown schema keys</h3>{view.unknownSchemaKeys.length ? <ul className="compact-list">{view.unknownSchemaKeys.map((key) => <li key={key}>{key}</li>)}</ul> : <p className="muted-copy">None detected.</p>}</section>
          </div>
          {view.issues.length ? <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Code</th></tr></thead><tbody>{view.issues.map((issue, index) => <tr key={`${issue.code}:${index}`}><td>{issue.severity}</td><td>{issue.code}</td></tr>)}</tbody></table></div> : null}
        </>
      )}
    </section>
  );
}
