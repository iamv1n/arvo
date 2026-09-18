import { DEFAULT_EXPIRY_RULES, type ExpiryEvent, type ExpiryRule } from './types';

/*
 * The F&O expiry calendar, computed rather than imported.
 *
 * Expiry is a rule, not a fact: an index expires on a fixed weekday, and the monthly contract
 * on the last such weekday of the month. The only thing a calendar file adds is the list of
 * days the exchange is shut, which pulls an expiry back to the previous trading day. So the
 * dates here are derived from the rules plus the holiday list the user imported, and the
 * function is pure: same rules, same holidays, same dates, forever.
 *
 * The weekday is configurable per index because exchanges move it. NSE index expiry has been
 * Thursday, then Monday, then Tuesday within a few years, and a hard-coded constant would have
 * been wrong three times. DEFAULT_EXPIRY_RULES holds the current published rules; the user
 * overrides them in settings when an exchange announces a change.
 */

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const fromIso = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** The last `weekday` of the month containing `day`. */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - shift);
  return toIso(last);
}

/**
 * Moves a nominal expiry back to the previous working day when it lands on a holiday or a
 * weekend. Exchanges always bring expiry forward, never push it out, so this only walks back.
 */
export function previousTradingDay(day: string, holidays: ReadonlySet<string>): string {
  let cursor = fromIso(day);
  for (let guard = 0; guard < 30; guard++) {
    const weekday = cursor.getUTCDay();
    const iso = toIso(cursor);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) return iso;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return day;
}

/**
 * Every expiry of every configured index between `from` and `to`, inclusive, oldest first.
 * A day that carries both a weekly and a monthly contract is reported once, as MONTHLY.
 */
export function computeExpiries(input: {
  from: string;
  to: string;
  rules?: ExpiryRule[];
  holidays?: Iterable<string>;
  indices?: string[];
}): ExpiryEvent[] {
  const rules = mergeExpiryRules(input.rules ?? []);
  const holidays = new Set(input.holidays ?? []);
  const wanted = input.indices?.length ? new Set(input.indices.map((i) => i.toUpperCase())) : null;
  const from = input.from;
  const to = input.to;
  if (from > to) return [];

  const events: ExpiryEvent[] = [];
  for (const rule of rules) {
    if (wanted && !wanted.has(rule.index)) continue;
    const seen = new Map<string, ExpiryEvent>();

    if (rule.monthly) {
      // Walk month by month over a window wide enough that a shifted expiry at either edge
      // still lands inside [from, to].
      const start = fromIso(from);
      const end = fromIso(to);
      for (
        let year = start.getUTCFullYear(), month = start.getUTCMonth() + 1;
        year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth() + 2);
        month === 12 ? ((year += 1), (month = 1)) : (month += 1)
      ) {
        const nominal = lastWeekdayOfMonth(year, month, rule.weekday);
        const actual = previousTradingDay(nominal, holidays);
        seen.set(actual, { index: rule.index, date: actual, cadence: 'MONTHLY', shiftedFrom: actual === nominal ? null : nominal });
      }
    }

    if (rule.weekly) {
      // First occurrence of the weekday on or after `from`, then every seven days.
      const start = fromIso(from);
      const shift = (rule.weekday - start.getUTCDay() + 7) % 7;
      const first = new Date(start.getTime() + shift * DAY_MS);
      for (let cursor = first; toIso(cursor) <= to; cursor = new Date(cursor.getTime() + 7 * DAY_MS)) {
        const nominal = toIso(cursor);
        const actual = previousTradingDay(nominal, holidays);
        if (seen.has(actual)) continue;
        seen.set(actual, { index: rule.index, date: actual, cadence: 'WEEKLY', shiftedFrom: actual === nominal ? null : nominal });
      }
    }

    for (const event of seen.values()) {
      if (event.date >= from && event.date <= to) events.push(event);
    }
  }

  return events.sort((a, b) => (a.date === b.date ? a.index.localeCompare(b.index) : a.date.localeCompare(b.date)));
}

/** The user's overrides layered over the published defaults, by index name. */
export function mergeExpiryRules(overrides: ExpiryRule[]): ExpiryRule[] {
  const byIndex = new Map(DEFAULT_EXPIRY_RULES.map((rule) => [rule.index, { ...rule }]));
  for (const override of overrides) {
    const index = override.index.trim().toUpperCase();
    if (!index) continue;
    byIndex.set(index, { ...override, index });
  }
  return [...byIndex.values()].sort((a, b) => a.index.localeCompare(b.index));
}

/** The next expiry on or after `from` for one index, or null when the rules do not cover it. */
export function nextExpiry(index: string, from: string, rules: ExpiryRule[], holidays: Iterable<string> = []): ExpiryEvent | null {
  const to = toIso(new Date(fromIso(from).getTime() + 70 * DAY_MS));
  return computeExpiries({ from, to, rules, holidays, indices: [index] })[0] ?? null;
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysUntil(from: string, to: string): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / DAY_MS);
}

/** `day` shifted by `days`, as YYYY-MM-DD. */
export function shiftDays(day: string, days: number): string {
  return toIso(new Date(fromIso(day).getTime() + days * DAY_MS));
}

/** The Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const date = fromIso(day);
  const shift = (date.getUTCDay() + 6) % 7;
  return toIso(new Date(date.getTime() - shift * DAY_MS));
}

/** Formats a UTC date as YYYY-MM-DD without going through the string slicing twice. */
export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}
