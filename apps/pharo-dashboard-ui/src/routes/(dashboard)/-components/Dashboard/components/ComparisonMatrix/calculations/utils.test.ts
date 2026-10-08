import { describe, expect, test } from 'vitest';
import { calculatePriceStatistics, getHistoricalComparison } from './utils';

function points(prices: readonly number[]) {
  return prices.map((price, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    price,
  }));
}

describe('historical statistics parity with the backend contract', () => {
  test.each([
    [[100, 110, 99], -1, 14.14213562373095, 10],
    [[100, 80, 120, 90], -10, 41.93248541803041, 25],
    [[100, 200, 180], 80, 77.78174593052023, 10],
    [[100, 100, 100], 0, 0, 0],
    [[100, 110, 121], 21, 0, 0],
    [[100, 110, 121, 133.1], 33.1, 0, 0],
    [[100, 90, 81, 72.9], -27.1, 0, 27.1],
    [[100, 90, 80, 70], -30, 1.252569375784137, 30],
    [[100, 60, 80, 120], 20, 47.88102539203387, 40],
  ] as const)(
    'matches independently specified financial results for %j',
    (prices, total, volatility, drawdown) => {
      const result = calculatePriceStatistics(points(prices));
      expect(result?.totalReturnPercent).toBeCloseTo(total, 10);
      expect(result?.dailyVolatilityPercent).toBeCloseTo(volatility, 10);
      expect(result?.maxDrawdownPercent).toBeCloseTo(drawdown, 10);
    },
  );

  test.each([
    { prices: [75.25], total: 0, drawdown: 0 },
    { prices: [100, 80], total: -20, drawdown: 20 },
    { prices: [80, 100], total: 25, drawdown: 0 },
  ])('has null sample volatility for $prices', ({ prices, total, drawdown }) => {
    const result = calculatePriceStatistics(points(prices));
    expect(result?.totalReturnPercent).toBeCloseTo(total, 10);
    expect(result?.dailyVolatilityPercent).toBeNull();
    expect(result?.maxDrawdownPercent).toBeCloseTo(drawdown, 10);
  });

  test('retains sub-cent precision, positive decimal extremes and readonly observations', () => {
    const history = Object.freeze(
      points([100, 100.000001, 100.000003]).map((point) => Object.freeze(point)),
    );
    const snapshot = structuredClone(history);
    const result = calculatePriceStatistics(history);
    expect(result?.totalReturnPercent).toBeCloseTo(0.000003, 12);
    expect(result?.dailyVolatilityPercent).toBeCloseTo(0.000000707106767044412, 12);
    expect(history).toEqual(snapshot);
    const extreme = calculatePriceStatistics(
      points([1e-28, Number('79228162514264337593543950335'), 1e-28]),
    );
    expect(extreme?.totalReturnPercent).toBe(0);
    expect(extreme?.dailyVolatilityPercent).toBeGreaterThan(1e58);
    expect(extreme?.maxDrawdownPercent).toBe(100);
  });

  test('rejects invalid and nonfinite financial results without inventing zero metrics', () => {
    expect(calculatePriceStatistics([])).toBeUndefined();
    for (const prices of [[0], [-1], [NaN], [Infinity], [Number.MIN_VALUE, Number.MAX_VALUE, 1]])
      expect(calculatePriceStatistics(points(prices))).toBeUndefined();
    expect(calculatePriceStatistics(points([100, 90]).reverse())).toBeUndefined();
    expect(
      calculatePriceStatistics([
        { date: '2026-06-01', price: 100 },
        { date: '2026-06-01', price: 90 },
      ]),
    ).toBeUndefined();
  });

  test('uses an inclusive prefix and exact close, including missing and pre-history dates', () => {
    const history = [
      { date: '2026-06-01', price: 100 },
      { date: '2026-06-03', price: 80 },
      { date: '2026-06-04', price: 120 },
    ];
    const before = getHistoricalComparison(history, Date.parse('2026-05-31'));
    expect(before).toMatchObject({
      observationCount: 0,
      closingPrice: undefined,
      statistics: undefined,
    });
    const first = getHistoricalComparison(history, Date.parse('2026-06-01'));
    expect(first).toMatchObject({
      closingPrice: 100,
      observationCount: 1,
      statistics: {
        totalReturnPercent: 0,
        dailyVolatilityPercent: null,
        maxDrawdownPercent: 0,
      },
    });
    const gap = getHistoricalComparison(history, Date.parse('2026-06-02'));
    expect(gap.closingPrice).toBeUndefined();
    expect(gap.statistics).toEqual(first.statistics);
    expect(gap.lastTimestamp).toBe(Date.parse('2026-06-01'));
    const cutoff = getHistoricalComparison(history, Date.parse('2026-06-03'));
    expect(cutoff.observationCount).toBe(2);
    expect(cutoff.closingPrice).toBe(80);
    expect(cutoff.statistics?.maxDrawdownPercent).toBeCloseTo(20, 10);
    expect(cutoff.statistics?.dailyVolatilityPercent).toBeNull();
    expect(getHistoricalComparison(history, Date.parse('2026-06-04')).statistics).toEqual(
      calculatePriceStatistics(history),
    );
  });
});
