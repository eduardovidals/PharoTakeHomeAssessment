import { describe, expect, test } from 'vitest';
import { toCalendarDate } from './utils';

describe('comparison calendar date conversion', () => {
  test.each(['2026-03-08', '2026-11-01', '2026-08-03'])(
    'round trips %s at UTC midnight without daylight-saving or local-time shifts',
    (date) => {
      const timestamp = Date.parse(`${date}T00:00:00.000Z`);
      const calendarDate = toCalendarDate(timestamp);

      expect(calendarDate.toString()).toBe(date);
      expect(calendarDate.toDate('UTC').getTime()).toBe(timestamp);
    },
  );
});
