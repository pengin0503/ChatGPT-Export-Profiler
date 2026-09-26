import { useI18n } from '../i18n';
import type { DateRange } from '../storage/analyticsQueries';

export type RangePreset = '7d' | '30d' | '90d' | '1y' | 'all';

interface DateRangeFilterProps {
  value: RangePreset;
  onChange(value: RangePreset, range?: DateRange): void;
  now?: number;
}

function presetRange(preset: RangePreset, now: number): DateRange | undefined {
  if (preset === 'all') return undefined;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const today = Math.floor(now / 86_400) * 86_400;
  return { from: today - (days - 1) * 86_400, to: today + 86_400 };
}

export function DateRangeFilter({ value, onChange, now }: DateRangeFilterProps) {
  const { t } = useI18n();
  return (
    <label className="filter-control">
      <span>{t('range.label')}</span>
      <select
        aria-label={t('range.aria')}
        value={value}
        onChange={(event) => {
          const preset = event.target.value as RangePreset;
          const anchor = now ?? Date.now() / 1000;
          onChange(preset, presetRange(preset, anchor));
        }}
      >
        <option value="7d">{t('range.7d')}</option>
        <option value="30d">{t('range.30d')}</option>
        <option value="90d">{t('range.90d')}</option>
        <option value="1y">{t('range.1y')}</option>
        <option value="all">{t('range.all')}</option>
      </select>
    </label>
  );
}
