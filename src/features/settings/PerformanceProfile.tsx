import { useEffect, useState } from 'react';
import { formatMessage, useI18n, type TranslationKey } from '../../i18n';
import { loadSetting, saveSetting, type PerformancePreference } from './preferences';

const profiles: Array<{
  value: PerformancePreference;
  labelKey: TranslationKey;
  detailKey: TranslationKey;
}> = [
  { value: 'auto', labelKey: 'settings.performance.auto', detailKey: 'settings.performance.autoDetail' },
  { value: 'safe', labelKey: 'settings.performance.safe', detailKey: 'settings.performance.safeDetail' },
  { value: 'standard', labelKey: 'settings.performance.standard', detailKey: 'settings.performance.standardDetail' },
  { value: 'fast', labelKey: 'settings.performance.fast', detailKey: 'settings.performance.fastDetail' }
];

export function PerformanceProfile() {
  const { t } = useI18n();
  const [value, setValue] = useState<PerformancePreference>('auto');
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadSetting<PerformancePreference>('performance-profile').then((stored) => {
      if (active && (stored === 'auto' || stored === 'safe' || stored === 'standard' || stored === 'fast')) setValue(stored);
    });
    return () => { active = false; };
  }, []);

  const selected = profiles.find((profile) => profile.value === value) ?? profiles[0];

  return (
    <section className="panel" aria-labelledby="performance-profile-heading">
      <h3 id="performance-profile-heading">{t('settings.performance.title')}</h3>
      <label>
        <span>{t('settings.performance.profile')}</span>
        <select
          aria-label={t('settings.performance.profile')}
          value={value}
          onChange={(event) => {
            const next = event.target.value as PerformancePreference;
            setValue(next);
            const profile = profiles.find((candidate) => candidate.value === next) ?? profiles[0];
            void saveSetting('performance-profile', next).then(() => {
              setStatus(formatMessage(t('settings.performance.saved'), { profile: t(profile.labelKey) }));
            });
          }}
        >
          {profiles.map((profile) => <option key={profile.value} value={profile.value}>{t(profile.labelKey)}</option>)}
        </select>
      </label>
      <p className="muted-copy">{t(selected.detailKey)}</p>
      {status ? <p className="success-note" role="status">{status}</p> : null}
    </section>
  );
}
