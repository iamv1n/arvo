import dayjs from 'dayjs';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}:${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : decimals ? 2 : 0,
      minimumFractionDigits: compact || !decimals ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Display-only formatting of an API decimal string. Never used for calculations. */
export function formatMoney(
  amount: string | number,
  currency = 'INR',
  options: { compact?: boolean; decimals?: boolean } = {},
): string {
  return formatter(currency, options.compact ?? false, options.decimals ?? true).format(Number(amount));
}

export function formatDate(date: string): string {
  return dayjs(date).format('D MMM YYYY');
}

export function formatMonth(month: string): string {
  return dayjs(`${month}-01`).format('MMM YY');
}

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
