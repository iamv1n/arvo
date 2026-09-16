import dayjs from 'dayjs';

export type PeriodKey = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'this-year';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3-months', label: '3 months' },
  { value: 'last-6-months', label: '6 months' },
  { value: 'this-year', label: 'This year' },
];

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

/** Calendar date ranges for period presets, in the browser's local calendar. */
export function periodRange(key: PeriodKey, now = dayjs()): { from: string; to: string } {
  switch (key) {
    case 'this-month':
      return { from: fmt(now.startOf('month')), to: fmt(now.endOf('month')) };
    case 'last-month': {
      const last = now.subtract(1, 'month');
      return { from: fmt(last.startOf('month')), to: fmt(last.endOf('month')) };
    }
    case 'last-3-months':
      return { from: fmt(now.subtract(2, 'month').startOf('month')), to: fmt(now.endOf('month')) };
    case 'last-6-months':
      return { from: fmt(now.subtract(5, 'month').startOf('month')), to: fmt(now.endOf('month')) };
    case 'this-year':
      return { from: fmt(now.startOf('year')), to: fmt(now.endOf('year')) };
  }
}
