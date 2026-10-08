import { describe, expect, test } from 'vitest';
import {
  datesSpanYears,
  formatDateAccessible,
  formatDateAxis,
  formatDateDetail,
  formatDateRange,
  formatDateTable,
  toUtcTimestamp,
} from './date';

describe('UTC presentation', () => {
  test.each([
    ['0001-01-01', -62135596800000],
    ['0099-01-01', -59042995200000],
    ['2024-02-29', 1709164800000],
    ['2024-03-10', 1710028800000],
    ['9999-12-31', 253402214400000],
  ])('preserves the exact DateOnly instant %s', (date, expected) => {
    expect(toUtcTimestamp(date)).toBe(expected);
    expect(new Date(toUtcTimestamp(date)).toISOString()).toBe(`${date}T00:00:00.000Z`);
  });

  test.each([
    '0000-01-01',
    '2026-02-29',
    '2024-02-30',
    '2024-13-01',
    '2024-00-01',
    '2024-01-32',
    '2024-2-09',
    '2024-02-09 ',
    '2024-02-09T00:00:00Z',
    '',
  ])('rejects invalid DateOnly %s', (date) => {
    expect(() => toUtcTimestamp(date)).toThrow(RangeError);
  });

  test('separates concise axis, complete inspection, table and spoken dates', () => {
    const timestamp = toUtcTimestamp('2026-06-23');
    expect(formatDateAxis(timestamp)).toBe('Jun 23');
    expect(formatDateAxis(timestamp, true)).toBe('Jun 23, 2026');
    expect(formatDateDetail(timestamp)).toBe('Tue, Jun 23, 2026');
    expect(formatDateTable(timestamp)).toBe('Jun 23, 2026');
    expect(formatDateAccessible(timestamp)).toBe('Tuesday, June 23, 2026');
    expect(formatDateDetail(toUtcTimestamp('2024-03-10'))).toBe('Sun, Mar 10, 2024');
    expect(formatDateTable(toUtcTimestamp('0001-01-01'))).toBe('Jan 1, 0001');
  });

  test('formats same-year, cross-year and single-record ranges honestly', () => {
    const first = toUtcTimestamp('2026-06-23');
    const last = toUtcTimestamp('2026-08-03');
    expect(formatDateRange(first, last)).toBe('Jun 23 – Aug 3, 2026');
    expect(formatDateRange(toUtcTimestamp('2026-12-22'), toUtcTimestamp('2027-01-12'))).toBe(
      'Dec 22, 2026 – Jan 12, 2027',
    );
    expect(formatDateRange(first, first)).toBe('Jun 23, 2026');
    expect(formatDateRange(last, first)).toBe('Unavailable');
    expect(datesSpanYears(first, last)).toBe(false);
    expect(datesSpanYears(first, toUtcTimestamp('2027-01-12'))).toBe(true);
  });

  test.each([null, undefined, NaN, Infinity, -Infinity, 0.5, 8640000000000001])(
    'never interprets missing or invalid epoch %s as today',
    (timestamp) => {
      for (const formatter of [
        formatDateAxis,
        formatDateDetail,
        formatDateTable,
        formatDateAccessible,
      ])
        expect(formatter(timestamp)).toBe('Unavailable');
      expect(formatDateRange(timestamp, 0)).toBe('Unavailable');
      expect(datesSpanYears(timestamp, 0)).toBe(false);
    },
  );
});
