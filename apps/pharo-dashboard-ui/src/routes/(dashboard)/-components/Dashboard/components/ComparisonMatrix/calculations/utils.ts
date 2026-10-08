import type { PriceSeries, PriceStats } from '../../../../../../../api/prices/types';
import { toUtcTimestamp } from '../../../../../../../utils/date';
import type { HistoricalComparison } from './types';

/** Match PriceStatisticsCalculator's unrounded double operations and sample variance. */
export function calculatePriceStatistics(prices: PriceSeries): PriceStats | undefined {
  if (
    prices.length === 0 ||
    prices.some(
      (point, index) =>
        !Number.isFinite(point.price) ||
        point.price <= 0 ||
        (index > 0 && (prices[index - 1]?.date ?? '') >= point.date),
    )
  )
    return undefined;
  const values = prices.map(({ price }) => price);
  const first = values[0];
  const last = values.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const totalReturnPercent = 100 * (last / first - 1);
  let peak = first;
  let maximumDrawdown = 0;
  for (const price of values.slice(1)) {
    peak = Math.max(peak, price);
    maximumDrawdown = Math.max(maximumDrawdown, (peak - price) / peak);
  }
  let dailyVolatilityPercent: number | null = null;
  if (values.length >= 3) {
    const returns: number[] = [];
    let returnSum = 0;
    for (let index = 0; index < values.length - 1; index += 1) {
      const current = values[index];
      const next = values[index + 1];
      if (current === undefined || next === undefined) return undefined;
      const dailyReturn = next / current - 1;
      if (!Number.isFinite(dailyReturn)) return undefined;
      returns.push(dailyReturn);
      returnSum += dailyReturn;
    }
    const mean = returnSum / returns.length;
    if (!Number.isFinite(mean)) return undefined;
    let squaredDeviationSum = 0;
    for (const dailyReturn of returns) {
      const deviation = dailyReturn - mean;
      squaredDeviationSum += deviation * deviation;
    }
    const sampleVariance = squaredDeviationSum / (returns.length - 1);
    if (!Number.isFinite(sampleVariance)) return undefined;
    dailyVolatilityPercent = 100 * Math.sqrt(sampleVariance);
  }
  const maxDrawdownPercent = 100 * maximumDrawdown;
  return [totalReturnPercent, dailyVolatilityPercent ?? 0, maxDrawdownPercent].every(
    Number.isFinite,
  )
    ? { totalReturnPercent, dailyVolatilityPercent, maxDrawdownPercent }
    : undefined;
}

/** Inclusive prefix statistics never substitute a previous close for a missing date. */
export function getHistoricalComparison(
  prices: PriceSeries,
  selectedTimestamp: number,
): HistoricalComparison {
  if (!Number.isFinite(selectedTimestamp)) return { observationCount: 0 };
  const prefix = prices.filter(({ date }) => toUtcTimestamp(date) <= selectedTimestamp);
  const first = prefix[0];
  const last = prefix.at(-1);
  return {
    closingPrice: last && toUtcTimestamp(last.date) === selectedTimestamp ? last.price : undefined,
    statistics: calculatePriceStatistics(prefix),
    firstTimestamp: first ? toUtcTimestamp(first.date) : undefined,
    lastTimestamp: last ? toUtcTimestamp(last.date) : undefined,
    observationCount: prefix.length,
  };
}
