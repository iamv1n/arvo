import type { ReminderFrequency } from '@arvo/database';

const DAY_MS = 86_400_000;
export const REMINDER_INTERVAL_DAYS = 15;
/** A monthly reminder on a preferred day never fires sooner than this after the anchor. */
export const MONTHLY_MIN_GAP_DAYS = 28;

/** Same instant one calendar month later, clamped to the month's last day (31 Jan → 28/29 Feb). */
export function addMonthClamped(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(month);
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

/**
 * When the next reminder is due after `anchor` (the last committed import, the last reminder,
 * or account creation — whichever is latest). Dates are evaluated in UTC.
 *
 * - every_15_days: anchor + 15 days.
 * - monthly without a preferred day: anchor + 1 calendar month (clamped at month end).
 * - monthly on day D (1–28): the first day D at least 28 days after the anchor's date.
 */
export function nextReminderDue(frequency: ReminderFrequency, anchor: Date, preferredDay: number | null = null): Date | null {
  if (frequency === 'off') return null;
  if (frequency === 'every_15_days') return new Date(anchor.getTime() + REMINDER_INTERVAL_DAYS * DAY_MS);
  if (!preferredDay) return addMonthClamped(anchor);

  const day = Math.min(Math.max(Math.trunc(preferredDay), 1), 28);
  const earliest = new Date(anchor.getTime() + MONTHLY_MIN_GAP_DAYS * DAY_MS);
  const earliestDate = Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate());
  let candidate = Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), day);
  if (candidate < earliestDate) candidate = Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth() + 1, day);
  return new Date(candidate);
}

export function latest(...dates: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...dates.filter((d): d is Date => !!d).map((d) => d.getTime())));
}

export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}
