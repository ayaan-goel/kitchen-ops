import { describe, expect, it } from 'vitest';
import {
  addDays,
  cutoffAt,
  dateInZone,
  dbDate,
  deliveryDayStatus,
  fromDbDate,
  isLocked,
  isoWeekday,
  latestLockedDate,
  nextCutoffInstant,
  type WorkingCalendar,
  zonedInstant,
} from './calendar';

const IST = 'Asia/Kolkata';
const MON_FRI: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: new Set() };
const ALL_WEEK: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5, 6, 7], holidays: new Set() };
const TWO_DAYS_AT_16 = { cutoffDaysBefore: 2, cutoffTime: 16 * 60 };

const iso = (d: Date) => d.toISOString();

describe('calendar helpers', () => {
  it('knows the weekdays of the review window', () => {
    expect(isoWeekday('2026-10-03')).toBe(6); // Saturday
    expect(isoWeekday('2026-10-05')).toBe(1); // Monday
    expect(isoWeekday('2026-10-07')).toBe(3); // Wednesday
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('builds kitchen wall-clock instants (IST is UTC+5:30)', () => {
    expect(iso(zonedInstant('2026-10-05', 960, IST))).toBe('2026-10-05T10:30:00.000Z');
  });

  it('gives the kitchen date of an instant, not the UTC date', () => {
    // 20:00 UTC on Oct 3 is already 01:30 on Oct 4 in IST.
    expect(dateInZone(new Date('2026-10-03T20:00:00Z'), IST)).toBe('2026-10-04');
  });

  it('round-trips Prisma DATE values without shifting the day', () => {
    expect(fromDbDate(dbDate('2026-10-05'))).toBe('2026-10-05');
    expect(iso(dbDate('2026-10-05'))).toBe('2026-10-05T00:00:00.000Z');
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('5 Oct', 1)).toThrow(RangeError);
  });
});

describe('cutoffAt (CUT-01)', () => {
  it("matches the brief: 2 working days at 16:00 → Wednesday delivery locks Monday 16:00", () => {
    expect(iso(cutoffAt('2026-10-07', TWO_DAYS_AT_16, MON_FRI, IST))).toBe('2026-10-05T10:30:00.000Z');
  });

  it('skips the weekend when counting back (Monday delivery → Thursday 16:00)', () => {
    expect(iso(cutoffAt('2026-10-12', TWO_DAYS_AT_16, MON_FRI, IST))).toBe('2026-10-08T10:30:00.000Z');
  });

  it('skips kitchen holidays (Tuesday holiday → Wednesday delivery locks the previous Friday)', () => {
    const kitchen: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(['2026-10-06']) };
    expect(iso(cutoffAt('2026-10-07', TWO_DAYS_AT_16, kitchen, IST))).toBe('2026-10-02T10:30:00.000Z');
  });

  it('counts every day for a 7-day kitchen (Monday delivery → Saturday 16:00)', () => {
    expect(iso(cutoffAt('2026-10-12', TWO_DAYS_AT_16, ALL_WEEK, IST))).toBe('2026-10-10T10:30:00.000Z');
  });

  it('N = 0 locks on the delivery day itself at the cut-off time', () => {
    const sameDay = { cutoffDaysBefore: 0, cutoffTime: 9 * 60 };
    expect(iso(cutoffAt('2026-10-07', sameDay, MON_FRI, IST))).toBe('2026-10-07T03:30:00.000Z');
  });

  it('crosses the year boundary and skips a New Year holiday', () => {
    const kitchen: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(['2027-01-01']) };
    // Monday 4 Jan 2027: Sun, Sat skipped, Fri 1 Jan holiday, Thu 31 Dec (1), Wed 30 Dec (2).
    expect(iso(cutoffAt('2027-01-04', TWO_DAYS_AT_16, kitchen, IST))).toBe('2026-12-30T10:30:00.000Z');
  });

  it('ignores the company calendar entirely', () => {
    // cutoffAt has no company input by design; a company holiday on Monday changes nothing.
    expect(iso(cutoffAt('2026-10-07', TWO_DAYS_AT_16, MON_FRI, IST))).toBe('2026-10-05T10:30:00.000Z');
  });

  it('works in other kitchen time zones', () => {
    expect(iso(cutoffAt('2026-10-07', TWO_DAYS_AT_16, MON_FRI, 'America/New_York'))).toBe(
      '2026-10-05T20:00:00.000Z',
    );
  });

  it('fails loudly if the kitchen never works', () => {
    const never: WorkingCalendar = { workingDays: [], holidays: new Set() };
    expect(() => cutoffAt('2026-10-07', TWO_DAYS_AT_16, never, IST)).toThrow(RangeError);
  });
});

describe('isLocked', () => {
  const cutoff = new Date('2026-10-05T10:30:00.000Z'); // Mon 16:00 IST for Wed 7 Oct

  it('is open one millisecond before the cut-off and locked exactly at it', () => {
    expect(isLocked('2026-10-07', new Date(cutoff.getTime() - 1), TWO_DAYS_AT_16, MON_FRI, IST)).toBe(false);
    expect(isLocked('2026-10-07', cutoff, TWO_DAYS_AT_16, MON_FRI, IST)).toBe(true);
  });

  it('stays locked once processed, even if settings later move the cut-off into the future', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    expect(isLocked('2026-10-20', now, TWO_DAYS_AT_16, MON_FRI, IST)).toBe(false);
    expect(isLocked('2026-10-20', now, TWO_DAYS_AT_16, MON_FRI, IST, new Set(['2026-10-20']))).toBe(true);
  });
});

describe('latestLockedDate / nextCutoffInstant', () => {
  it('Saturday 18:00 IST with a Mon–Fri kitchen: Tuesday is locked, Wednesday opens until Monday 16:00', () => {
    const now = new Date('2026-10-03T12:30:00Z'); // Sat 18:00 IST
    // Tue 6 Oct locks Thu 1 Oct; Wed 7 Oct locks Mon 5 Oct 16:00 (future).
    expect(latestLockedDate(now, TWO_DAYS_AT_16, MON_FRI, IST)).toBe('2026-10-06');
    expect(iso(nextCutoffInstant(now, TWO_DAYS_AT_16, MON_FRI, IST))).toBe('2026-10-05T10:30:00.000Z');
  });

  it('with a 7-day kitchen, today + 2 locks at today 16:00', () => {
    const before = new Date('2026-10-03T10:29:59Z'); // Sat 15:59:59 IST
    const after = new Date('2026-10-03T10:30:00Z'); // Sat 16:00 IST
    expect(latestLockedDate(before, TWO_DAYS_AT_16, ALL_WEEK, IST)).toBe('2026-10-04');
    expect(latestLockedDate(after, TWO_DAYS_AT_16, ALL_WEEK, IST)).toBe('2026-10-05');
  });
});

describe('deliveryDayStatus (A-02)', () => {
  const company: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(['2026-10-08']) };

  it('accepts an open day for both calendars', () => {
    expect(deliveryDayStatus('2026-10-07', ALL_WEEK, company)).toBe('OK');
  });

  it('rejects company non-working days and holidays', () => {
    expect(deliveryDayStatus('2026-10-10', ALL_WEEK, company)).toBe('COMPANY_CLOSED');
    expect(deliveryDayStatus('2026-10-08', ALL_WEEK, company)).toBe('COMPANY_HOLIDAY');
  });

  it('rejects days the kitchen does not cook', () => {
    const kitchen: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(['2026-10-07']) };
    expect(deliveryDayStatus('2026-10-07', kitchen, company)).toBe('KITCHEN_HOLIDAY');
    expect(deliveryDayStatus('2026-10-11', kitchen, ALL_WEEK)).toBe('KITCHEN_CLOSED');
  });
});
