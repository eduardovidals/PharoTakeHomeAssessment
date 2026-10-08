import { describe, expect, it } from 'vitest';
import {
  createInspectionTimeline,
  formatAxisDate,
  formatDate,
  inspectTimestamp,
  prepareChartRecords,
} from './chartData';
import type { PharoChartPoint, PharoChartSeries } from '../types';

describe('shared recorded data without plot geometry', () => {
  it('sorts immutable copies while preserving precision, identities and explicit appearance', () => {
    const series: readonly PharoChartSeries[] = Object.freeze([
      Object.freeze({
        id: 'a',
        label: 'Sensor A',
        appearance: 'secondary',
        points: Object.freeze([
          Object.freeze({ x: 20, y: null }),
          Object.freeze({ x: 10, y: -0.123456789 }),
        ]),
      }),
    ]);
    const result = prepareChartRecords(series);

    expect(result.kind).toBe('ready');

    if (result.kind !== 'ready') throw new Error('Expected valid records.');

    expect(result.series).toEqual([
      {
        id: 'a',
        label: 'Sensor A',
        appearance: 'secondary',
        points: [
          { x: 10, y: -0.123456789 },
          { x: 20, y: null },
        ],
      },
    ]);
    expect(series[0]?.points[0]?.x).toBe(20);
    expect(result.series[0]?.points).not.toBe(series[0]?.points);
  });

  it('retains all-null rows and empty selected identities without requiring a renderable domain', () => {
    const result = prepareChartRecords([
      {
        id: 'a',
        label: 'A',
        points: [
          { x: 30, y: null },
          { x: 10, y: null },
        ],
      },
      { id: 'b', label: 'B', points: [] },
    ]);

    if (result.kind !== 'ready') throw new Error('All-null records are valid data.');

    expect(createInspectionTimeline(result.series)).toEqual([10, 30]);
    expect(inspectTimestamp(result.series, 10)).toEqual([
      { id: 'a', label: 'A', kind: 'missing', value: null },
      { id: 'b', label: 'B', kind: 'absent', value: null },
    ]);
    expect(prepareChartRecords([])).toEqual({ kind: 'ready', series: [] });
  });

  it('joins actual dates, distinguishing missing and absent values without interpolation', () => {
    const result = prepareChartRecords([
      {
        id: 'a',
        label: 'A',
        points: [
          { x: 1, y: 10 },
          { x: 3, y: null },
        ],
      },
      {
        id: 'b',
        label: 'B',
        points: [
          { x: 2, y: 8 },
          { x: 3, y: 9 },
        ],
      },
    ]);

    if (result.kind !== 'ready') throw new Error('Expected valid records.');

    expect(createInspectionTimeline(result.series)).toEqual([1, 2, 3]);
    expect(inspectTimestamp(result.series, 2)).toEqual([
      { id: 'a', label: 'A', kind: 'absent', value: null },
      { id: 'b', label: 'B', kind: 'available', value: 8 },
    ]);
    expect(inspectTimestamp(result.series, 3)).toEqual([
      { id: 'a', label: 'A', kind: 'missing', value: null },
      { id: 'b', label: 'B', kind: 'available', value: 9 },
    ]);
  });

  it.each([NaN, Infinity, 0.5, 8_640_000_000_000_001])('rejects invalid timestamp %s', (x) => {
    expect(prepareChartRecords([{ id: 'a', label: 'A', points: [{ x, y: 1 }] }]).kind).toBe(
      'invalid',
    );
  });

  it('rejects duplicate dates, nonfinite values and invalid or conflicting identities', () => {
    const a: PharoChartSeries = { id: 'a', label: 'A', points: [{ x: 1, y: 1 }] };

    for (const series of [
      [a, a],
      [{ ...a, id: ' ' }],
      [{ ...a, label: '' }],
      [
        {
          ...a,
          points: [
            { x: 1, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ],
      [{ ...a, points: [{ x: 1, y: Infinity }] }],
      Array<PharoChartSeries>(1),
      [{ ...a, points: Array<PharoChartPoint>(1) }],
    ])
      expect(prepareChartRecords(series).kind).toBe('invalid');

    expect(
      prepareChartRecords([
        { ...a, appearance: 'primary' },
        { ...a, id: 'b', appearance: 'primary' },
      ]).kind,
    ).toBe('invalid');
    // @ts-expect-error Untyped consumers still receive a safe invalid-data result.
    expect(prepareChartRecords('invalid').kind).toBe('invalid');
  });

  it('keeps small and extended years intact while default axis labels remain concise', () => {
    const value = Date.parse('2026-06-23T00:00:00.000Z');

    expect(formatAxisDate(value)).toBe('Jun 23');
    expect(formatAxisDate(value, true)).toBe('Jun 23, 2026');
    expect(formatDate(Date.parse('0001-01-01T00:00:00Z'))).toBe('0001-01-01');
    expect(formatAxisDate(Date.parse('+010000-01-01T00:00:00Z'))).toBe('+010000-01-01');
  });
});
