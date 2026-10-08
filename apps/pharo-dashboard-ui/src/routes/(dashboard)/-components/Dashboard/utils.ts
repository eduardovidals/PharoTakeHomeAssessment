import type { PharoChartSeries } from '@pharo/react-charts';

/** Navigate only real recorded UTC dates across the selected cached histories. */
export function getComparisonTimeline(series: readonly PharoChartSeries[]): readonly number[] {
  return [...new Set(series.flatMap(({ points }) => points.map(({ x }) => x)))].sort(
    (left, right) => left - right,
  );
}
