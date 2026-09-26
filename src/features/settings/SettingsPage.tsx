import { useEffect, useState } from 'react';
import { formatMessage, useI18n } from '../../i18n';
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
  const { locale, setLocale, t } = useI18n();
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
      setAliasStatus(t('settings.aliases.required'));
      return;
    }
    await saveSetting(`model-alias:${raw}`, { raw, canonical, source: 'local user override' });
    setAliasStatus(formatMessage(t('settings.aliases.saved'), { raw, canonical }));
  }

  return (
    <section className="analytics-page" aria-labelledby="settings-heading">
      <p className="eyebrow">{t('settings.eyebrow')}</p>
      <h2 id="settings-heading">{t('settings.heading')}</h2>
      <div className="panel-grid">
        <section className="panel" aria-labelledby="locale-heading">
          <h3 id="locale-heading">{t('settings.locale.title')}</h3>
          <label>
            <span>{t('settings.locale.language')}</span>
            <select aria-label={t('settings.locale.language')} value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'ja')}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </section>
        <PerformanceProfile />
        <section className="panel" aria-labelledby="zip-policy-heading">
          <h3 id="zip-policy-heading">{t('settings.zip.title')}</h3>
          <label>
            <span>{t('settings.zip.override')}</span>
            <select
              aria-label={t('settings.zip.override')}
              value={zipPolicy}
              onChange={(event) => {
                const next = event.target.value as ZipSafetyPreference;
                setZipPolicy(next);
                void saveSetting('zip-safety-policy', next);
              }}
            >
              <option value="default">{t('settings.zip.default')}</option>
              <option value="expanded">{t('settings.zip.expanded')}</option>
            </select>
          </label>
          <p className="muted-copy">{t('settings.zip.detail')}</p>
        </section>
        <section className="panel" aria-labelledby="aliases-heading">
          <h3 id="aliases-heading">{t('settings.aliases.title')}</h3>
          <div className="form-grid">
            <label><span>{t('settings.aliases.raw')}</span><input aria-label={t('settings.aliases.raw')} value={rawAlias} onChange={(event) => setRawAlias(event.target.value)} /></label>
            <label><span>{t('settings.aliases.canonical')}</span><input aria-label={t('settings.aliases.canonical')} value={canonicalModel} onChange={(event) => setCanonicalModel(event.target.value)} /></label>
          </div>
          <button type="button" className="primary-action" onClick={() => void saveAlias()}>{t('settings.aliases.save')}</button>
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
