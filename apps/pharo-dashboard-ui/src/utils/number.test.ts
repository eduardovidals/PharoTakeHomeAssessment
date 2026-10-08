import { describe, expect, test } from 'vitest';
import { formatPercentage, formatPrice, formatPriceAxis, formatSignedPercentage } from './number';

describe('supplied-unit number presentation', () => {
  test('groups two-decimal prices without currency or source-value changes', () => {
    const value = 12345.6789123;
    expect(formatPrice(value)).toBe('12,345.68');
    expect(formatPrice(20)).toBe('20.00');
    expect(value).toBe(12345.6789123);
    expect(formatPriceAxis(0.000012345)).toBe('0.000012345');
    expect(formatPriceAxis(12345.678)).toBe('12,345.678');
    expect(formatPriceAxis(100001)).toBe('100,001');
    expect(formatPriceAxis(100002)).toBe('100,002');
  });
  test('formats existing percentage points rather than multiplying by 100', () => {
    expect(formatPercentage(2.3456)).toBe('2.35%');
    expect(formatSignedPercentage(12.3456)).toBe('+12.35%');
    expect(formatSignedPercentage(-12.3456)).toBe('-12.35%');
    expect(formatPercentage(-4.562)).toBe('-4.56%');
  });
  test.each([-0, -0.0001, 0, 0.0001])(
    'suppresses signed display-zero %s without changing the input',
    (value) => {
      const original = value;
      expect(formatPercentage(value)).toBe('0.00%');
      expect(formatSignedPercentage(value)).toBe('0.00%');
      expect(formatPrice(value)).toBe('0.00');
      expect(Object.is(value, original)).toBe(true);
    },
  );
  test.each([null, undefined, NaN, Infinity, -Infinity])(
    'keeps missing/nonfinite value %s unavailable',
    (value) => {
      for (const formatter of [
        formatPrice,
        formatPriceAxis,
        formatPercentage,
        formatSignedPercentage,
      ])
        expect(formatter(value)).toBe('Unavailable');
    },
  );
});
