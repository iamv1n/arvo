import { addMonthClamped, nextReminderDue } from './due';

const d = (iso: string) => new Date(iso);

describe('nextReminderDue', () => {
  it('is null when reminders are off', () => {
    expect(nextReminderDue('off', d('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('adds 15 days for every_15_days, across month and year ends', () => {
    expect(nextReminderDue('every_15_days', d('2026-01-10T09:30:00Z'))).toEqual(d('2026-01-25T09:30:00Z'));
    expect(nextReminderDue('every_15_days', d('2026-02-20T00:00:00Z'))).toEqual(d('2026-03-07T00:00:00Z'));
    expect(nextReminderDue('every_15_days', d('2026-12-25T12:00:00Z'))).toEqual(d('2027-01-09T12:00:00Z'));
  });

  it('adds one calendar month for monthly, clamping at month end', () => {
    expect(nextReminderDue('monthly', d('2026-01-15T08:00:00Z'))).toEqual(d('2026-02-15T08:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-01-31T08:00:00Z'))).toEqual(d('2026-02-28T08:00:00Z'));
    expect(nextReminderDue('monthly', d('2028-01-31T08:00:00Z'))).toEqual(d('2028-02-29T08:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-03-31T08:00:00Z'))).toEqual(d('2026-04-30T08:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-12-31T08:00:00Z'))).toEqual(d('2027-01-31T08:00:00Z'));
    expect(addMonthClamped(d('2026-08-31T00:00:00Z'))).toEqual(d('2026-09-30T00:00:00Z'));
  });

  it('uses the preferred day at least 28 days after the anchor', () => {
    expect(nextReminderDue('monthly', d('2026-01-03T10:00:00Z'), 5)).toEqual(d('2026-02-05T00:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-01-20T10:00:00Z'), 5)).toEqual(d('2026-03-05T00:00:00Z'));
    // Month end: 31 Jan + 28 days = 28 Feb, so the next 5th is in March.
    expect(nextReminderDue('monthly', d('2026-01-31T23:00:00Z'), 5)).toEqual(d('2026-03-05T00:00:00Z'));
    // A reminder sent on the preferred day repeats on the same day next month, even in February.
    expect(nextReminderDue('monthly', d('2026-02-05T10:00:00Z'), 5)).toEqual(d('2026-03-05T00:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-01-28T10:00:00Z'), 28)).toEqual(d('2026-02-28T00:00:00Z'));
    expect(nextReminderDue('monthly', d('2026-12-10T10:00:00Z'), 1)).toEqual(d('2027-02-01T00:00:00Z'));
  });
});
