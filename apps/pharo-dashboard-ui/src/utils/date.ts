import { dayjs } from '../lib/dayjs';

/** Missing/nonfinite presentation inputs are unavailable, never the current date. */
type DateValue = number | null | undefined;
const unavailable = 'Unavailable';

function utcDate(timestamp: DateValue) {
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) return null;
  const date = dayjs.utc(timestamp).locale('en');
  return date.isValid() ? date : null;
}

/** Convert strict API DateOnly input without low-year normalization or local midnight.
 * @example toUtcTimestamp('2024-02-29') // 1709164800000
 */
export function toUtcTimestamp(dateOnly: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) || dateOnly.startsWith('0000-'))
    throw new RangeError('Expected a valid UTC date-only value.');
  const date = dayjs.utc(`${dateOnly}T00:00:00.000Z`).locale('en');
  if (!date.isValid() || date.format('YYYY-MM-DD') !== dateOnly)
    throw new RangeError('Expected a valid UTC date-only value.');
  return date.valueOf();
}

/** Compact axis labels include the year only when the displayed range needs it. */
export function formatDateAxis(timestamp: DateValue, includeYear = false): string {
  return utcDate(timestamp)?.format(includeYear ? 'MMM D, YYYY' : 'MMM D') ?? unavailable;
}

/** Full UTC date for observation inspection. */
export function formatDateDetail(timestamp: DateValue): string {
  return utcDate(timestamp)?.format('ddd, MMM D, YYYY') ?? unavailable;
}

/** Human-readable raw table date; canonical machine values remain separate. */
export function formatDateTable(timestamp: DateValue): string {
  return utcDate(timestamp)?.format('MMM D, YYYY') ?? unavailable;
}

/** Complete spoken date for accessible observation descriptions. */
export function formatDateAccessible(timestamp: DateValue): string {
  return utcDate(timestamp)?.format('dddd, MMMM D, YYYY') ?? unavailable;
}

/** Whether valid UTC endpoints need different years on short labels. */
export function datesSpanYears(start: DateValue, end: DateValue): boolean {
  const first = utcDate(start);
  const last = utcDate(end);
  return Boolean(first && last && first.year() !== last.year());
}

/** One full range/year context, preserving actual start/end observations. */
export function formatDateRange(start: DateValue, end: DateValue): string {
  const first = utcDate(start);
  const last = utcDate(end);
  if (!first || !last || first.valueOf() > last.valueOf()) return unavailable;
  if (first.valueOf() === last.valueOf()) return first.format('MMM D, YYYY');
  const startFormat = first.year() === last.year() ? 'MMM D' : 'MMM D, YYYY';
  return `${first.format(startFormat)} – ${last.format('MMM D, YYYY')}`;
}
