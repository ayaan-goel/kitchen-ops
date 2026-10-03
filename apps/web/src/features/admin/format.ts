import { WEEKDAY_LABELS } from '@fernleaf/shared';

/** ISO weekdays → "Mon–Fri", "Every day" or "Mon Wed Fri". */
export const workingDaysText = (days: number[]) =>
  days.length === 7 ? 'Every day' : days.join(',') === '1,2,3,4,5' ? 'Mon–Fri' : days.map((d) => WEEKDAY_LABELS[d - 1]).join(' ');
