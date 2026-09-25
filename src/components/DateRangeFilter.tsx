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
  return { from: now - days * 86_400, to: now + 1 };
}

export function DateRangeFilter({ value, onChange, now }: DateRangeFilterProps) {
  return (
    <label className="filter-control">
      <span>Range</span>
      <select
        aria-label="Date range"
        value={value}
        onChange={(event) => {
          const preset = event.target.value as RangePreset;
          const anchor = now ?? Date.now() / 1000;
          onChange(preset, presetRange(preset, anchor));
        }}
      >
        <option value="7d">7 days</option>
        <option value="30d">30 days</option>
        <option value="90d">90 days</option>
        <option value="1y">1 year</option>
        <option value="all">All time</option>
      </select>
    </label>
  );
}
