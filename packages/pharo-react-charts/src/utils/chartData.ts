import { bisector } from 'd3-array';
import { utcFormat } from 'd3-time-format';
import type { ChartInspectionRow, ChartRecords, PharoChartPoint, PharoChartSeries } from '../types';

const dateLimit = 8_640_000_000_000_000;

const appearances = new Set(['primary', 'secondary', 'tertiary']);

const pointInsertion = bisector<PharoChartPoint, number>((point) => point.x).left;

const utcDate = utcFormat('%Y-%m-%d');

const shortDate = utcFormat('%b %-d');

const shortDateWithYear = utcFormat('%b %-d, %Y');

/** Validate and copy actual records independently of any plot size or numeric domain. */
export function prepareChartRecords(series: readonly PharoChartSeries[]): ChartRecords {
  const invalid: ChartRecords = { kind: 'invalid', message: 'Chart data is invalid.' };

  if (!Array.isArray(series) || series.length > 3) return invalid;

  const ids = new Set<string>();
  const explicitAppearances = new Set<string>();
  const ordered: PharoChartSeries[] = [];

  for (const item of series) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      ids.has(item.id) ||
      !Array.isArray(item.points)
    )
      return invalid;

    ids.add(item.id);

    if (item.appearance !== undefined) {
      if (!appearances.has(item.appearance) || explicitAppearances.has(item.appearance))
        return invalid;

      explicitAppearances.add(item.appearance);
    }

    const timestamps = new Set<number>();
    const points: PharoChartPoint[] = [];

    for (const point of item.points) {
      if (
        !point ||
        !Number.isInteger(point.x) ||
        Math.abs(point.x) > dateLimit ||
        (point.y !== null && (typeof point.y !== 'number' || !Number.isFinite(point.y))) ||
        timestamps.has(point.x)
      )
        return invalid;

      timestamps.add(point.x);
      points.push({ x: point.x, y: point.y });
    }

    points.sort((first, second) => first.x - second.x);
    ordered.push({
      id: item.id,
      label: item.label,
      points,
      ...(item.appearance === undefined ? {} : { appearance: item.appearance }),
    });
  }

  return { kind: 'ready', series: ordered };
}

/** Build the sorted union of actual timestamps, including explicit null records. */
export function createInspectionTimeline(series: readonly PharoChartSeries[]): readonly number[] {
  return [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort(
    (first, second) => first - second,
  );
}

/** Inspect sorted validated records at exactly one timestamp without borrowing a neighbor. */
export function inspectTimestamp(
  series: readonly PharoChartSeries[],
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

/** Independent full UTC default, preserving extended years without truncation. */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();

  return year < 0 || year > 9999 ? (date.toISOString().split('T')[0] ?? '') : utcDate(date);
}

/** Compact default axis date; callers with a multiyear domain request the year. */
export function formatAxisDate(timestamp: number, includeYear = false): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();

  if (year < 0 || year > 9999) return formatDate(timestamp);

  return (includeYear ? shortDateWithYear : shortDate)(date);
}

/** Unit-neutral full numeric default; never rounds underlying observations. */
export function formatNumber(value: number): string {
  return value.toString();
}
