import type { PharoChartSeries } from '@pharo/react-charts';

/** Union actual observations, including null values; the chart samples by measured label space.
 * @example recordedDateTicks(series) // sorted unique UTC epoch candidates
 */
export function recordedDateTicks(series: readonly PharoChartSeries[]): readonly number[] {
  return [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort(
    (left, right) => left - right,
  );
}
