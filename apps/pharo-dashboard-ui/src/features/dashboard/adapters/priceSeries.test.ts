import { describe, expect, test } from 'vitest';
import type { PriceSeries } from '../../../api/prices';
import { toChartSeries } from './priceSeries';

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
