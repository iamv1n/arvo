import { briefingDue, localParts } from './local-time';

describe('local time', () => {
  it('computes the local date, weekday and hour', () => {
    // 2026-09-21 is a Monday. 02:30 UTC = 08:00 IST.
    expect(localParts('Asia/Kolkata', new Date('2026-09-21T02:30:00Z'))).toEqual({ date: '2026-09-21', weekday: 1, hour: 8 });
    expect(localParts('America/New_York', new Date('2026-09-21T02:30:00Z'))).toEqual({ date: '2026-09-20', weekday: 7, hour: 22 });
    expect(localParts('Not/AZone', new Date('2026-09-21T02:30:00Z')).hour).toBe(8);
  });

  it('is due on Monday from 08:00 in the user timezone', () => {
    expect(briefingDue('Asia/Kolkata', new Date('2026-09-21T02:29:00Z'))).toBe(false);
    expect(briefingDue('Asia/Kolkata', new Date('2026-09-21T02:30:00Z'))).toBe(true);
    expect(briefingDue('Asia/Kolkata', new Date('2026-09-21T19:00:00Z'))).toBe(false); // Tuesday 00:30 IST
    expect(briefingDue(null, new Date('2026-09-21T05:00:00Z'))).toBe(true);
    expect(briefingDue('Europe/London', new Date('2026-09-21T06:59:00Z'))).toBe(false);
    expect(briefingDue('Europe/London', new Date('2026-09-21T07:00:00Z'))).toBe(true);
  });
});
