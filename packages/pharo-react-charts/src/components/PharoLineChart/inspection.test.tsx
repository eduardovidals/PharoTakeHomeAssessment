import { describe, expect, it } from 'vitest';
import { createInspectionTimeline, findNearestTimestamp, inspectTimestamp } from './inspection';
import type { PreparedChartSeries } from './types';

const series: readonly PreparedChartSeries[] = Object.freeze([
  Object.freeze({
    id: 'a',
    label: 'Sensor A',
    points: Object.freeze([
      Object.freeze({ x: 0, y: 2 }),
      Object.freeze({ x: 10, y: null }),
      Object.freeze({ x: 30, y: 8 }),
    ]),
    path: null,
    markers: Object.freeze([]),
  }),
  Object.freeze({
    id: 'b',
    label: 'Sensor B',
    points: Object.freeze([Object.freeze({ x: 10, y: 20 }), Object.freeze({ x: 20, y: 30 })]),
    path: null,
    markers: Object.freeze([]),
  }),
]);

describe('recorded chart observation inspection', () => {
  it('creates a sorted unique union including explicit null dates without mutating input', () => {
    const before = JSON.stringify(series);
    expect(createInspectionTimeline(series)).toEqual([0, 10, 20, 30]);
    expect(createInspectionTimeline([...series].reverse())).toEqual([0, 10, 20, 30]);
    expect(JSON.stringify(series)).toBe(before);
    expect(series[0]?.points.map((point) => point.x)).toEqual([0, 10, 30]);
  });

  it.each([
    [-1, 0],
    [0, 0],
    [5, 0],
    [10, 10],
    [15, 10],
    [25, 20],
    [31, 30],
  ])(
    'selects the actual nearest timestamp for %s, choosing %s at bounds and earlier ties',
    (candidate, expected) => {
      expect(findNearestTimestamp([0, 10, 20, 30], candidate)).toBe(expected);
    },
  );

  it('chooses the earlier recorded neighbor across an unequal interval', () => {
    expect(findNearestTimestamp([0, 10, 30], 20)).toBe(10);
    expect(findNearestTimestamp([0, 10, 30], 21)).toBe(30);
  });

  it('bounds singleton and valid extreme dates without fabricating a timestamp', () => {
    expect(findNearestTimestamp([10], -100)).toBe(10);
    expect(findNearestTimestamp([10], 100)).toBe(10);
    expect(findNearestTimestamp([-8_640_000_000_000_000, 8_640_000_000_000_000], 0)).toBe(
      -8_640_000_000_000_000,
    );
  });

  it('returns no selection for empty timelines or nonfinite candidates', () => {
    expect(createInspectionTimeline([])).toEqual([]);
    expect(findNearestTimestamp([], 0)).toBeUndefined();
    for (const candidate of [NaN, Infinity, -Infinity]) {
      expect(findNearestTimestamp([0, 10], candidate)).toBeUndefined();
    }
    expect(inspectTimestamp([], 0)).toEqual([]);
  });

  it.each([
    {
      timestamp: 0,
      expected: [
        { id: 'a', label: 'Sensor A', kind: 'available', value: 2 },
        { id: 'b', label: 'Sensor B', kind: 'absent', value: null },
      ],
    },
    {
      timestamp: 10,
      expected: [
        { id: 'a', label: 'Sensor A', kind: 'missing', value: null },
        { id: 'b', label: 'Sensor B', kind: 'available', value: 20 },
      ],
    },
    {
      timestamp: 20,
      expected: [
        { id: 'a', label: 'Sensor A', kind: 'absent', value: null },
        { id: 'b', label: 'Sensor B', kind: 'available', value: 30 },
      ],
    },
    {
      timestamp: 30,
      expected: [
        { id: 'a', label: 'Sensor A', kind: 'available', value: 8 },
        { id: 'b', label: 'Sensor B', kind: 'absent', value: null },
      ],
    },
  ])(
    'reports only exact observations at $timestamp, retaining missing versus absent reasons',
    ({ timestamp, expected }) => {
      expect(inspectTimestamp(series, timestamp)).toEqual(expected);
    },
  );

  it('does not borrow either neighboring observation for an unrecorded timestamp', () => {
    expect(inspectTimestamp(series, 15)).toEqual([
      { id: 'a', label: 'Sensor A', kind: 'absent', value: null },
      { id: 'b', label: 'Sensor B', kind: 'absent', value: null },
    ]);
  });
});
