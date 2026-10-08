import { describe, expect, test } from 'vitest';
import type { PharoChartSeries } from '@pharo/react-charts';
import { recordedDateTicks } from './recordedDateTicks';

describe('recorded date tick candidates', () => {
  test('unions asynchronous unequal histories and null records without filling calendar gaps', () => {
    const series: readonly PharoChartSeries[] = [
      {
        id: 'later',
        label: 'Later',
        points: [
          { x: 1710201600000, y: 10 },
          { x: 1710460800000, y: null },
        ],
      },
      {
        id: 'earlier',
        label: 'Earlier',
        points: [
          { x: 1710028800000, y: 20 },
          { x: 1710201600000, y: 22 },
        ],
      },
      { id: 'pending', label: 'Pending', points: [] },
    ];
    const before = JSON.stringify(series);
    expect(recordedDateTicks(series)).toEqual([1710028800000, 1710201600000, 1710460800000]);
    expect(JSON.stringify(series)).toBe(before);
  });
  test('does not manufacture endpoints for empty or single-observation collections', () => {
    expect(recordedDateTicks([])).toEqual([]);
    expect(recordedDateTicks([{ id: 'empty', label: 'Empty', points: [] }])).toEqual([]);
    expect(recordedDateTicks([{ id: 'one', label: 'One', points: [{ x: 1, y: null }] }])).toEqual([
      1,
    ]);
  });
});
