import { bisectLeft, bisector } from 'd3-array';
import type { ChartInspectionRow, PharoChartPoint, PreparedChartSeries } from './types';

const pointInsertion = bisector<PharoChartPoint, number>((point) => point.x).left;

/** @internal Build the sorted union of actual timestamps, including null records. */
export function createInspectionTimeline(
  series: readonly PreparedChartSeries[],
): readonly number[] {
  return [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort(
    (first, second) => first - second,
  );
}

/** @internal Select a recorded timestamp, clamping bounds and choosing earlier ties. */
export function findNearestTimestamp(
  timeline: readonly number[],
  candidate: number,
): number | undefined {
  if (!Number.isFinite(candidate) || timeline.length === 0) return undefined;
  const insertion = bisectLeft(timeline, candidate);
  const earlier = timeline[insertion - 1];
  const later = timeline[insertion];
  if (earlier === undefined) return later;
  if (later === undefined) return earlier;
  return candidate - earlier <= later - candidate ? earlier : later;
}

/** @internal Inspect each series at exactly one timestamp, without borrowing a neighbor. */
export function inspectTimestamp(
  series: readonly PreparedChartSeries[],
  timestamp: number,
): readonly ChartInspectionRow[] {
  return series.map((item) => {
    const index = pointInsertion(item.points, timestamp);
    const point = item.points[index];
    const identity = { id: item.id, label: item.label };
    if (!point || point.x !== timestamp) return { ...identity, kind: 'absent', value: null };
    if (point.y === null) return { ...identity, kind: 'missing', value: null };
    return { ...identity, kind: 'available', value: point.y };
  });
}
