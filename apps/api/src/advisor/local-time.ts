export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Calendar date, ISO weekday (1 = Monday) and hour of `now` in a timezone; IST when the zone is invalid. */
export function localParts(timezone: string | null | undefined, now = new Date()): { date: string; weekday: number; hour: number } {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timezone || DEFAULT_TIMEZONE);
  } catch {
    parts = format(DEFAULT_TIMEZONE);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday, hour: Number(get('hour')) };
}

/** Weekly briefings go out on Monday from 08:00 local time. */
export function briefingDue(timezone: string | null | undefined, now = new Date()): boolean {
  const local = localParts(timezone, now);
  return local.weekday === 1 && local.hour >= 8;
}
