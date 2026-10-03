import { DateTime } from 'luxon';

/**
 * Calendar rules: delivery days and the order cut-off (CUT-01, COMP-03, A-02…A-05).
 *
 * A `CalendarDate` is a kitchen-local date string `YYYY-MM-DD`. Times of day are minutes after
 * midnight in the kitchen time zone. Instants are JS `Date`s (UTC). Nothing here reads the
 * process time zone, so results are identical whatever TZ the server or browser runs in.
 */
export type CalendarDate = string;

/** ISO weekdays, 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WorkingCalendar {
  workingDays: readonly number[];
  holidays: ReadonlySet<CalendarDate>;
}

export interface CutoffSettings {
  /** Number of kitchen working days before delivery. */
  cutoffDaysBefore: number;
  /** Minutes after midnight, kitchen time. */
  cutoffTime: number;
}

export type DeliveryDayStatus =
  | 'OK'
  | 'KITCHEN_CLOSED'
  | 'KITCHEN_HOLIDAY'
  | 'COMPANY_CLOSED'
  | 'COMPANY_HOLIDAY';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOOKBACK_DAYS = 366;

function parse(date: CalendarDate): DateTime {
  if (!DATE_RE.test(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  const dt = DateTime.fromISO(date, { zone: 'utc' });
  if (!dt.isValid) throw new RangeError(`Invalid calendar date: ${date}`);
  return dt;
}

function format(dt: DateTime): CalendarDate {
  return dt.toISODate() as CalendarDate;
}

export function isoWeekday(date: CalendarDate): IsoWeekday {
  return parse(date).weekday as IsoWeekday;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return format(parse(date).plus({ days }));
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Kitchen-local date of an instant. */
export function dateInZone(instant: Date, zone: string): CalendarDate {
  return DateTime.fromJSDate(instant, { zone }).toISODate() as CalendarDate;
}

/** The instant of a kitchen-local wall-clock time (built from the wall clock, so DST-safe). */
export function zonedInstant(date: CalendarDate, minutes: number, zone: string): Date {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Time of day out of range: ${minutes}`);
  }
  const d = parse(date);
  const dt = DateTime.fromObject(
    { year: d.year, month: d.month, day: d.day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    { zone },
  );
  if (!dt.isValid) throw new RangeError(`Invalid zone or time: ${zone}`);
  return dt.toJSDate();
}

export function isWorkingDay(calendar: WorkingCalendar, date: CalendarDate): boolean {
  return calendar.workingDays.includes(isoWeekday(date)) && !calendar.holidays.has(date);
}

/**
 * Can the company receive a delivery on this date? The kitchen must be cooking that day
 * and the company must be open (A-02).
 */
export function deliveryDayStatus(
  date: CalendarDate,
  kitchen: WorkingCalendar,
  company: WorkingCalendar,
): DeliveryDayStatus {
  const weekday = isoWeekday(date);
  if (!kitchen.workingDays.includes(weekday)) return 'KITCHEN_CLOSED';
  if (kitchen.holidays.has(date)) return 'KITCHEN_HOLIDAY';
  if (!company.workingDays.includes(weekday)) return 'COMPANY_CLOSED';
  if (company.holidays.has(date)) return 'COMPANY_HOLIDAY';
  return 'OK';
}

/**
 * The instant orders for `deliveryDate` lock (CUT-01, A-04): count back N kitchen working days
 * (the delivery day itself is not counted; kitchen non-working days and holidays are skipped) and
 * take the cut-off time on the day reached. N = 0 means the delivery day itself.
 * The company calendar never moves the cut-off.
 */
export function cutoffAt(
  deliveryDate: CalendarDate,
  settings: CutoffSettings,
  kitchen: WorkingCalendar,
  zone: string,
): Date {
  if (!Number.isInteger(settings.cutoffDaysBefore) || settings.cutoffDaysBefore < 0) {
    throw new RangeError(`cutoffDaysBefore must be a non-negative integer`);
  }
  let day = deliveryDate;
  let counted = 0;
  let steps = 0;
  while (counted < settings.cutoffDaysBefore) {
    day = addDays(day, -1);
    steps += 1;
    if (steps > MAX_LOOKBACK_DAYS) {
      throw new RangeError('The kitchen calendar has no working days to count the cut-off back from');
    }
    if (isWorkingDay(kitchen, day)) counted += 1;
  }
  return zonedInstant(day, settings.cutoffTime, zone);
}

/** A date is locked once its cut-off has passed, or once it has been processed (A-05). */
export function isLocked(
  deliveryDate: CalendarDate,
  now: Date,
  settings: CutoffSettings,
  kitchen: WorkingCalendar,
  zone: string,
  processedDates: ReadonlySet<CalendarDate> = new Set(),
): boolean {
  if (processedDates.has(deliveryDate)) return true;
  return now.getTime() >= cutoffAt(deliveryDate, settings, kitchen, zone).getTime();
}

/**
 * The latest delivery date whose cut-off has passed. Because cut-off instants never decrease as
 * the delivery date moves forward, the locked dates form a prefix ending here.
 * Yesterday is always locked (its cut-off is at the latest yesterday at the cut-off time).
 */
export function latestLockedDate(
  now: Date,
  settings: CutoffSettings,
  kitchen: WorkingCalendar,
  zone: string,
): CalendarDate {
  let locked = addDays(dateInZone(now, zone), -1);
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i += 1) {
    const next = addDays(locked, 1);
    if (cutoffAt(next, settings, kitchen, zone).getTime() > now.getTime()) return locked;
    locked = next;
  }
  return locked;
}

/** The next cut-off instant strictly after `now` (for the scheduler). */
export function nextCutoffInstant(
  now: Date,
  settings: CutoffSettings,
  kitchen: WorkingCalendar,
  zone: string,
): Date {
  return cutoffAt(addDays(latestLockedDate(now, settings, kitchen, zone), 1), settings, kitchen, zone);
}

/** Prisma surfaces DATE columns as JS Dates at 00:00 UTC; convert explicitly, never via local getters. */
export function dbDate(date: CalendarDate): Date {
  return new Date(`${format(parse(date))}T00:00:00.000Z`);
}

export function fromDbDate(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10);
}
