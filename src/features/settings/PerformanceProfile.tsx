import { useEffect, useState } from 'react';
import { loadSetting, saveSetting, type PerformancePreference } from './preferences';

const profiles: Array<{ value: PerformancePreference; label: string; detail: string }> = [
  { value: 'auto', label: 'Auto', detail: 'Choose a bounded profile from device parallelism.' },
  { value: 'safe', label: 'Safe', detail: 'Small batches and one in-flight batch.' },
  { value: 'standard', label: 'Standard', detail: 'Balanced default for most devices.' },
  { value: 'fast', label: 'Fast', detail: 'Larger batches for capable desktop-class devices.' }
];

export function PerformanceProfile() {
  const [value, setValue] = useState<PerformancePreference>('auto');
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadSetting<PerformancePreference>('performance-profile').then((stored) => {
      if (active && (stored === 'auto' || stored === 'safe' || stored === 'standard' || stored === 'fast')) setValue(stored);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="panel" aria-labelledby="performance-profile-heading">
      <h3 id="performance-profile-heading">Performance profile</h3>
      <label>
        <span>Import performance profile</span>
        <select
          aria-label="Import performance profile"
          value={value}
          onChange={(event) => {
            const next = event.target.value as PerformancePreference;
            setValue(next);
            void saveSetting('performance-profile', next).then(() => setStatus(`Saved ${next} profile.`));
          }}
        >
          {profiles.map((profile) => <option key={profile.value} value={profile.value}>{profile.label}</option>)}
        </select>
      </label>
      <p className="muted-copy">{profiles.find((profile) => profile.value === value)?.detail}</p>
      {status ? <p className="success-note" role="status">{status}</p> : null}
    </section>
  );
}
