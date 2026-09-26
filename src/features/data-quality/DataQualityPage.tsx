import { useEffect, useState } from 'react';
import { resolveModel } from '../../analysis/modelRegistry';
import { useI18n } from '../../i18n';
import { getModelMetrics } from '../../storage/analyticsQueries';
import { openProfilerDb } from '../../storage/db';
import { loadModelAliases } from '../settings/preferences';

interface CoverageView {
  attempted: number;
  identified: number;
  ratio: number | null;
  exact: number;
  family: number;
  fallback: number;
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

const emptyCoverage = (): CoverageView => ({ attempted: 0, identified: 0, ratio: null, exact: 0, family: 0, fallback: 0 });

function parseCoverage(value: unknown): CoverageView {
  if (typeof value !== 'object' || value === null) return emptyCoverage();
  const record = value as Record<string, unknown>;
  return {
    attempted: typeof record.attempted === 'number' ? record.attempted : 0,
    identified: typeof record.identified === 'number' ? record.identified : 0,
    ratio: typeof record.ratio === 'number' ? record.ratio : null,
    exact: typeof record.exact === 'number' ? record.exact : 0,
    family: typeof record.family === 'number' ? record.family : 0,
    fallback: typeof record.fallback === 'number' ? record.fallback : 0
  };
}

function percent(value: CoverageView): string {
  return value.ratio === null ? 'n/a' : `${(value.ratio * 100).toFixed(1)}%`;
}

export function DataQualityPage({ analysisId }: { analysisId: string }) {
  const { t } = useI18n();
  const [view, setView] = useState<QualityView>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      openProfilerDb().then(async (db) => {
        try { return await db.get('dataQuality', analysisId); } finally { db.close(); }
      }),
      getModelMetrics(analysisId),
      loadModelAliases()
    ]).then(([qualityRecord, models, modelAliases]) => {
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
      const localAliasTargets = new Set(Object.values(modelAliases));
      const unknownModels = models
        .filter((model) => !localAliasTargets.has(model.modelId) && resolveModel(model.modelId, modelAliases).confidence === 'unknown')
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
      <p className="eyebrow">{t('quality.eyebrow')}</p>
      <h2 id="quality-heading">{t('nav.dataQuality')}</h2>
      {!view ? <p className="muted-copy">{t('quality.loading')}</p> : (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span className="metric-label">{t('quality.fatal')}</span><strong className="metric-value">{view.fatal}</strong></article>
            <article className="metric-card"><span className="metric-label">{t('quality.recoverable')}</span><strong className="metric-value">{view.recoverable}</strong></article>
            <article className="metric-card"><span className="metric-label">{t('quality.warnings')}</span><strong className="metric-value">{view.warning}</strong></article>
            <article className="metric-card"><span className="metric-label">{t('quality.unknownSchema')}</span><strong className="metric-value">{view.unknownSchema}</strong></article>
          </div>
          <div className="panel-grid">
            <section className="panel">
              <h3>{t('quality.coverage')}</h3>
              <p>{t('quality.modelIdentification')}: {percent(view.modelIdentification)} ({view.modelIdentification.identified}/{view.modelIdentification.attempted})</p>
              <p>{t('quality.tokenization')}: {percent(view.tokenization)} ({view.tokenization.identified}/{view.tokenization.attempted})</p>
              <p className="muted-copy">confidence: exact {view.tokenization.exact} · family {view.tokenization.family} · fallback {view.tokenization.fallback}</p>
            </section>
            <section className="panel"><h3>{t('quality.unknownModels')}</h3>{view.unknownModels.length ? <ul className="compact-list">{view.unknownModels.map((model) => <li key={model}>{model}</li>)}</ul> : <p className="muted-copy">{t('quality.noneDetected')}</p>}</section>
            <section className="panel"><h3>{t('quality.unknownSchemaKeys')}</h3>{view.unknownSchemaKeys.length ? <ul className="compact-list">{view.unknownSchemaKeys.map((key) => <li key={key}>{key}</li>)}</ul> : <p className="muted-copy">{t('quality.noneDetected')}</p>}</section>
          </div>
          {view.issues.length ? <div className="table-wrap"><table><thead><tr><th>{t('quality.severity')}</th><th>{t('quality.code')}</th></tr></thead><tbody>{view.issues.map((issue, index) => <tr key={`${issue.code}:${index}`}><td>{issue.severity}</td><td>{issue.code}</td></tr>)}</tbody></table></div> : null}
        </>
      )}
    </section>
  );
}