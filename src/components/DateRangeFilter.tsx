import { useState } from 'react';
import { useI18n } from '../i18n';
import type { DateRange } from '../storage/analyticsQueries';

export type RangePreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

interface DateRangeFilterProps {
  value: RangePreset;
  onChange(value: RangePreset, range?: DateRange): void;
  now?: number;
}

function presetRange(preset: RangePreset, now: number): DateRange | undefined {
  if (preset === 'all' || preset === 'custom') return undefined;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const today = Math.floor(now / 86_400) * 86_400;
  return { from: today - (days - 1) * 86_400, to: today + 86_400 };
}

function parseDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : undefined;
}

function customRange(fromValue: string, toValue: string): DateRange | undefined {
  const from = parseDate(fromValue);
  const inclusiveTo = parseDate(toValue);
  if (from === undefined || inclusiveTo === undefined || inclusiveTo < from) return undefined;
  return { from, to: inclusiveTo + 86_400 };
}

export function DateRangeFilter({ value, onChange, now }: DateRangeFilterProps) {
  const { t } = useI18n();
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  return (
    <div className="filter-row wrap">
      <label className="filter-control">
        <span>{t('range.label')}</span>
        <select
          aria-label={t('range.aria')}
          value={value}
          onChange={(event) => {
            const preset = event.target.value as RangePreset;
            const anchor = now ?? Date.now() / 1000;
            onChange(preset, preset === 'custom' ? customRange(customFrom, customTo) : presetRange(preset, anchor));
          }}
        >
          <option value="7d">{t('range.7d')}</option>
          <option value="30d">{t('range.30d')}</option>
          <option value="90d">{t('range.90d')}</option>
          <option value="1y">{t('range.1y')}</option>
          <option value="all">{t('range.all')}</option>
          <option value="custom">{t('range.custom')}</option>
        </select>
      </label>
      {value === 'custom' ? (
        <>
          <label className="filter-control">
            <span>{t('range.from')}</span>
            <input
              type="date"
              aria-label={t('range.fromAria')}
              value={customFrom}
              onChange={(event) => {
                const next = event.target.value;
                setCustomFrom(next);
                onChange('custom', customRange(next, customTo));
              }}
            />
          </label>
          <label className="filter-control">
            <span>{t('range.to')}</span>
            <input
              type="date"
              aria-label={t('range.toAria')}
              value={customTo}
              onChange={(event) => {
                const next = event.target.value;
                setCustomTo(next);
                onChange('custom', customRange(customFrom, next));
              }}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
