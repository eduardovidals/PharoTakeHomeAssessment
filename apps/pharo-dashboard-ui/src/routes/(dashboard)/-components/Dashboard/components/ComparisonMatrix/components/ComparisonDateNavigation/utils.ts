import { fromDate, toCalendarDate as calendarDateFromValue } from '@internationalized/date';

/** Adapt cached UTC midnight timestamps to calendar-only values without a local-time shift. */
export function toCalendarDate(timestamp: number) {
  return calendarDateFromValue(fromDate(new Date(timestamp), 'UTC'));
}
