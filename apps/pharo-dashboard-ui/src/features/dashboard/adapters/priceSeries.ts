import type { PharoChartSeries } from '@pharo/react-charts';
import type { PriceSeries } from '../../../api/prices';

/**
 * Map validated DateOnly closes to UTC observations without changing their prices.
 * @example
 * ```ts
 * const series = toChartSeries('AAPL', history);
 * ```
 */
export function toChartSeries(ticker: string, points: PriceSeries): PharoChartSeries {
  return {
    id: ticker,
    label: ticker,
    points: points.map((point) => ({
      x: Date.parse(point.date + 'T00:00:00.000Z'),
      y: point.price,
    })),
  };
}
