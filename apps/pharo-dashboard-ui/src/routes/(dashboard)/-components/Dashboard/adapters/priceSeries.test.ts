import { describe, expect, test } from 'vitest';
import type { PriceSeries } from '../../../../../api/prices';
import type { PharoChartSeries } from '@pharo/react-charts';
import {
  getSeriesWindows,
  haveMismatchedWindows,
  toChartSeries,
  toPerformanceSeries,
} from './priceSeries';

describe('price history chart adapter', () => {
  test('maps literal UTC instants and keeps exact supplied prices and identity', () => {
    const input: PriceSeries = Object.freeze([
      Object.freeze({ date: '0001-01-01', price: 0.00000001 }),
      Object.freeze({ date: '0099-01-01', price: 123.45678912345679 }),
      Object.freeze({ date: '2024-02-29', price: 42.25 }),
      Object.freeze({ date: '2024-03-10', price: 100.125 }),
    ]);
    const before = JSON.stringify(input);
    const result = toChartSeries('A.B-1', input);

    expect(result).toEqual({
      id: 'A.B-1',
      label: 'A.B-1',
      points: [
        { x: -62135596800000, y: 0.00000001 },
        { x: -59042995200000, y: 123.45678912345679 },
        { x: 1709164800000, y: 42.25 },
        { x: 1710028800000, y: 100.125 },
      ],
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(result.points).not.toBe(input);
  });

  test('preserves an empty selected identity without inventing an observation', () => {
    expect(toChartSeries('PENDING', [])).toEqual({ id: 'PENDING', label: 'PENDING', points: [] });
  });

  test('maps a single point without adding dates, appearances or rounding', () => {
    expect(toChartSeries('SINGLE', [{ date: '2024-03-10', price: 1.000000001 }])).toEqual({
      id: 'SINGLE',
      label: 'SINGLE',
      points: [{ x: 1710028800000, y: 1.000000001 }],
    });
  });

  test('rejects an impossible date if a caller violates the validated API contract', () => {
    expect(() => toChartSeries('INVALID', [{ date: '2026-02-29', price: 10 }])).toThrow(RangeError);
  });
});

describe('rebased price change', () => {
  test.each([
    { prices: [100, 110, 99], expected: [0, 10, -1] },
    { prices: [100, 200, 180], expected: [0, 100, 80] },
    { prices: [40, 40, 40], expected: [0, 0, 0] },
    { prices: [1], expected: [0] },
  ])('matches independent unrounded price-change examples $prices', ({ prices, expected }) => {
    const series: PharoChartSeries = {
      id: 'A',
      label: 'A',
      appearance: 'secondary',
      points: prices.map((y, x) => ({ x, y })),
    };
    const result = toPerformanceSeries(series);

    expect(result.kind).toBe('ready');

    result.series.points.forEach((point, index) =>
      expect(point.y).toBeCloseTo(expected[index] ?? NaN, 12),
    );

    expect(result.series).toMatchObject({ id: 'A', label: 'A', appearance: 'secondary' });
    expect(result.series.points.map((point) => point.x)).toEqual(
      series.points.map((point) => point.x),
    );
  });

  test('preserves frozen precision-rich raw observations and leading/interior null gaps', () => {
    const series: PharoChartSeries = Object.freeze({
      id: 'B',
      label: 'B',
      appearance: 'tertiary',
      points: Object.freeze([
        Object.freeze({ x: 1, y: null }),
        Object.freeze({ x: 2, y: 100.123456789 }),
        Object.freeze({ x: 3, y: null }),
        Object.freeze({ x: 5, y: 123.987654321 }),
      ]),
    });
    const original = JSON.stringify(series);
    const result = toPerformanceSeries(series);

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('Expected a valid price-change base.');
    expect(result.baseTimestamp).toBe(2);
    expect(result.series.points).toEqual([
      { x: 1, y: null },
      { x: 2, y: 0 },
      { x: 3, y: null },
      { x: 5, y: 100 * (123.987654321 / 100.123456789 - 1) },
    ]);
    expect(JSON.stringify(series)).toBe(original);
    expect(result.series.points).not.toBe(series.points);
  });

  test.each([
    { values: [], reason: 'no-observations' },
    { values: [null, null], reason: 'no-observations' },
    { values: [0, 10], reason: 'invalid-base' },
    { values: [-1, 10], reason: 'invalid-base' },
    { values: [Infinity, 10], reason: 'invalid-observation' },
    { values: [100, NaN], reason: 'invalid-observation' },
    { values: [Number.MIN_VALUE, Number.MAX_VALUE], reason: 'invalid-observation' },
  ])(
    'keeps unavailable $reason observations missing without fabricated zero paths',
    ({ values, reason }) => {
      const result = toPerformanceSeries({
        id: 'A',
        label: 'A',
        points: values.map((y, x) => ({ x, y })),
      });

      expect(result).toMatchObject({
        kind: 'unavailable',
        reason,
        series: { id: 'A', label: 'A' },
      });
      expect(result.series.points).toEqual(values.map((_, x) => ({ x, y: null })));
    },
  );

  test('shares actual windows only when starts, ends, counts and base dates agree', () => {
    const raw = toChartSeries(
      'A',
      [
        { date: '2024-01-01', price: 10 },
        { date: '2024-01-03', price: 20 },
      ],
      'secondary',
    );

    expect(raw.appearance).toBe('secondary');
    expect(haveMismatchedWindows(getSeriesWindows([raw, { ...raw, id: 'B' }]))).toBe(false);
    expect(
      haveMismatchedWindows(
        getSeriesWindows([
          raw,
          { id: 'B', label: 'B', points: [{ x: raw.points[1]?.x ?? 0, y: 30 }] },
        ]),
      ),
    ).toBe(true);
    expect(getSeriesWindows([{ id: 'pending', label: 'Pending', points: [] }])).toEqual([]);

    const windows = getSeriesWindows([raw]);

    expect(windows[0]).toMatchObject({
      id: 'A',
      firstTimestamp: 1704067200000,
      lastTimestamp: 1704240000000,
      observationCount: 2,
      baseTimestamp: 1704067200000,
    });
  });
});
