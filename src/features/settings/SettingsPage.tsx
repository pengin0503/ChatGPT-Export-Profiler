import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { PerformanceProfile } from './PerformanceProfile';
import { PricingEditor } from './PricingEditor';
import { StoragePanel } from './StoragePanel';
import { loadSetting, saveSetting, type ZipSafetyPreference } from './preferences';

interface SettingsPageProps {
  analysisId?: string;
  protectedAnalysisId?: string;
  onAnalysisDeleted?(): void;
}

export function SettingsPage({ analysisId, protectedAnalysisId, onAnalysisDeleted }: SettingsPageProps) {
  const { locale, setLocale } = useI18n();
  const [zipPolicy, setZipPolicy] = useState<ZipSafetyPreference>('default');
  const [rawAlias, setRawAlias] = useState('');
  const [canonicalModel, setCanonicalModel] = useState('');
  const [aliasStatus, setAliasStatus] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadSetting<ZipSafetyPreference>('zip-safety-policy').then((stored) => {
      if (active && (stored === 'default' || stored === 'expanded')) setZipPolicy(stored);
    });
    return () => { active = false; };
  }, []);

  async function saveAlias(): Promise<void> {
    const raw = rawAlias.trim();
    const canonical = canonicalModel.trim();
    if (!raw || !canonical) {
      setAliasStatus('Both alias fields are required.');
      return;
    }
    await saveSetting(`model-alias:${raw}`, { raw, canonical, source: 'local user override' });
    setAliasStatus(`Saved local model alias ${raw} → ${canonical}.`);
  }

  return (
    <section className="analytics-page" aria-labelledby="settings-heading">
      <p className="eyebrow">LOCAL APP PREFERENCES</p>
      <h2 id="settings-heading">Settings</h2>
      <div className="panel-grid">
        <section className="panel" aria-labelledby="locale-heading">
          <h3 id="locale-heading">Locale</h3>
          <label>
            <span>Interface language</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'ja')}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </section>
        <PerformanceProfile />
        <section className="panel" aria-labelledby="zip-policy-heading">
          <h3 id="zip-policy-heading">ZIP safety policy</h3>
          <label>
            <span>Local ZIP safety override</span>
            <select
              aria-label="Local ZIP safety override"
              value={zipPolicy}
              onChange={(event) => {
                const next = event.target.value as ZipSafetyPreference;
                setZipPolicy(next);
                void saveSetting('zip-safety-policy', next);
              }}
            >
              <option value="default">Default safety limits</option>
              <option value="expanded">Expanded size limits</option>
            </select>
          </label>
          <p className="muted-copy">Expanded mode raises entry and conversation-size ceilings only. Path traversal and suspicious compression checks remain enabled.</p>
        </section>
        <section className="panel" aria-labelledby="aliases-heading">
          <h3 id="aliases-heading">Model aliases</h3>
          <div className="form-grid">
            <label><span>Raw model alias</span><input aria-label="Raw model alias" value={rawAlias} onChange={(event) => setRawAlias(event.target.value)} /></label>
            <label><span>Canonical model ID</span><input aria-label="Canonical model ID" value={canonicalModel} onChange={(event) => setCanonicalModel(event.target.value)} /></label>
          </div>
          <button type="button" className="primary-action" onClick={() => void saveAlias()}>Save model alias</button>
          {aliasStatus ? <p className="success-note" role="status">{aliasStatus}</p> : null}
        </section>
      </div>
      <PricingEditor />
      <StoragePanel
        analysisId={analysisId}
        protectedAnalysisId={protectedAnalysisId}
        onAnalysisDeleted={onAnalysisDeleted}
      />
    </section>
  );
}
