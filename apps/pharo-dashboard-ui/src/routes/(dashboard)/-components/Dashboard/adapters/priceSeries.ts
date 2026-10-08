import type { PharoChartAppearance, PharoChartSeries } from '@pharo/react-charts';
import type { PriceSeries } from '../../../../../api/prices';
import { toUtcTimestamp } from '../../../../../utils/date';
import type { PerformanceSeriesResult, SeriesWindow } from './types';

/**
 * Map validated DateOnly closes to UTC observations without changing their prices.
 * @example
 * ```ts
 * const series = toChartSeries('AAPL', history);
 * ```
 */
export function toChartSeries(
  ticker: string,
  points: PriceSeries,
  appearance?: PharoChartAppearance,
): PharoChartSeries {
  return {
    id: ticker,
    label: ticker,
    ...(appearance ? { appearance } : {}),
    points: points.map((point) => ({
      x: toUtcTimestamp(point.date),
      y: point.price,
    })),
  };
}

function unavailablePerformance(
  series: PharoChartSeries,
  reason: Extract<PerformanceSeriesResult, { kind: 'unavailable' }>['reason'],
): PerformanceSeriesResult {
  return {
    kind: 'unavailable',
    reason,
    series: { ...series, points: series.points.map((point) => ({ x: point.x, y: null })) },
  };
}

/** Rebase chronological observations from toChartSeries, preserving dates, gaps and raw data.
 * @example toPerformanceSeries({ id: 'A', label: 'A', points: [{ x: 1, y: 100 }, { x: 2, y: 110 }] })
 */
export function toPerformanceSeries(series: PharoChartSeries): PerformanceSeriesResult {
  const first = series.points.find((point) => point.y !== null);

  if (!first || first.y === null) return unavailablePerformance(series, 'no-observations');
  if (!Number.isFinite(first.y)) return unavailablePerformance(series, 'invalid-observation');
  if (first.y <= 0) return unavailablePerformance(series, 'invalid-base');

  const base = first.y;
  const points = series.points.map((point) => ({
    x: point.x,
    y: point.y === null ? null : 100 * (point.y / base - 1),
  }));

  if (points.some((point) => point.y !== null && !Number.isFinite(point.y)))
    return unavailablePerformance(series, 'invalid-observation');

  return { kind: 'ready', baseTimestamp: first.x, series: { ...series, points } };
}

/** Describe chronological toChartSeries windows; empty/pending identities never fabricate dates. */
export function getSeriesWindows(series: readonly PharoChartSeries[]): readonly SeriesWindow[] {
  return series.flatMap((item) => {
    const first = item.points.at(0);
    const last = item.points.at(-1);

    if (!first || !last) return [];

    const base = item.points.find((point) => point.y !== null);

    return [
      {
        id: item.id,
        label: item.label,
        firstTimestamp: first.x,
        lastTimestamp: last.x,
        observationCount: item.points.length,
        ...(base && base.y !== null && Number.isFinite(base.y) && base.y > 0
          ? { baseTimestamp: base.x }
          : {}),
      },
    ];
  });
}

/** A shared range/count is truthful only when every available series actually agrees. */
export function haveMismatchedWindows(windows: readonly SeriesWindow[]): boolean {
  const first = windows.at(0);
  return Boolean(
    first &&
    windows.some(
      (item) =>
        item.firstTimestamp !== first.firstTimestamp ||
        item.lastTimestamp !== first.lastTimestamp ||
        item.observationCount !== first.observationCount ||
        item.baseTimestamp !== first.baseTimestamp,
    ),
  );
}
