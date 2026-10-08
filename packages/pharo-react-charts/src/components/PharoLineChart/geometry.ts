import { scaleLinear, scaleUtc } from 'd3-scale';
import { curveLinear, line } from 'd3-shape';
import { prepareChartRecords } from '../../utils/chartData';
import type {
  ChartGeometry,
  ChartTick,
  PharoChartPoint,
  PharoChartSeries,
  PreparedChartSeries,
} from './types';

const dateLimit = 8_640_000_000_000_000;
const halfDay = 43_200_000;

/** Prepare finite shared geometry on chronological copies, never caller arrays. */
export function prepareChartGeometry(
  series: readonly PharoChartSeries[],
  width: number,
  height: number,
  xTickValues?: readonly number[],
  baselineY?: number,
): ChartGeometry {
  const invalidData: ChartGeometry = {
    kind: 'invalid',
    reason: 'PHARO-CHART-DATA',
    message: 'Chart data is invalid.',
  };
  const invalidDomain: ChartGeometry = {
    kind: 'invalid',
    reason: 'PHARO-CHART-DOMAIN',
    message: 'Chart values cannot be represented safely.',
  };
  const records = prepareChartRecords(series);
  if (records.kind === 'invalid' || (baselineY !== undefined && !Number.isFinite(baselineY)))
    return invalidData;
  if (
    xTickValues !== undefined &&
    (!Array.isArray(xTickValues) ||
      [...xTickValues].some((value) => !Number.isInteger(value) || Math.abs(value) > dateLimit) ||
      new Set(xTickValues).size !== xTickValues.length)
  )
    return invalidData;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const ordered = records.series;
  for (const item of ordered) {
    for (const point of item.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      if (point.y !== null) {
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  if (minY === Infinity) return { kind: 'empty', message: 'No observations to display.' };
  if (baselineY !== undefined) {
    minY = Math.min(minY, baselineY);
    maxY = Math.max(maxY, baselineY);
  }

  const plot = { left: 56, top: 16, right: width - 16, bottom: height - 48 };
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    plot.right <= plot.left ||
    plot.bottom <= plot.top
  ) {
    return {
      kind: 'unmeasured',
      reason: 'PHARO-CHART-SIZE',
      message: 'Chart needs more space to display.',
    };
  }
  if (minX === maxX) {
    minX = Math.max(-dateLimit, minX - halfDay);
    maxX = Math.min(dateLimit, maxX + halfDay);
  }
  if (minY === maxY) {
    const padding = Math.max(Math.abs(minY) * 0.05, 1);
    minY -= padding;
    maxY += padding;
  }
  if (
    ![minX, maxX, minY, maxY, maxX - minX, maxY - minY].every(Number.isFinite) ||
    maxX <= minX ||
    maxY <= minY
  )
    return invalidDomain;

  const xDomain: readonly [number, number] = [minX, maxX];
  const yDomain: readonly [number, number] = [minY, maxY];
  const xScale = scaleUtc().domain(xDomain).range([plot.left, plot.right]);
  const yScale = scaleLinear().domain(yDomain).range([plot.bottom, plot.top]);
  const xTickCount = Math.min(6, Math.max(2, Math.floor((plot.right - plot.left) / 110)));
  const yTickCount = Math.min(6, Math.max(2, Math.floor((plot.bottom - plot.top) / 55)));
  // D3's reciprocal tick increment cannot represent subnormal steps safely.
  if (!Number.isFinite(1 / ((maxY - minY) / yTickCount))) return invalidDomain;
  let xTicks: ChartTick[];
  let yTicks: ChartTick[];
  try {
    // Filtered D3 calendar intervals can loop after offsetting beyond Date's
    // limits. Extended-year domains use validated endpoints instead; UTC
    // projection and recorded observations remain unchanged.
    const calendarSafe =
      new Date(minX).getUTCFullYear() >= 0 && new Date(maxX).getUTCFullYear() <= 9999;
    xTicks =
      xTickValues !== undefined
        ? [...xTickValues]
            .filter((value) => value >= minX && value <= maxX)
            .sort((a, b) => a - b)
            .map((value) => ({ value, position: xScale(value) }))
        : calendarSafe
          ? xScale
              .ticks(xTickCount)
              .map((date) => ({ value: date.getTime(), position: xScale(date) }))
          : xDomain.map((value) => ({ value, position: xScale(value) }));
    yTicks = yScale.ticks(yTickCount).map((value) => ({ value, position: yScale(value) }));
  } catch (error) {
    if (error instanceof RangeError) return invalidDomain;
    throw error;
  }
  if (
    ![...xTicks, ...yTicks].every(
      (tick) => Number.isFinite(tick.value) && Number.isFinite(tick.position),
    )
  ) {
    return invalidDomain;
  }

  const pathFor = line<PharoChartPoint>()
    .defined((point) => point.y !== null)
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y ?? 0))
    .curve(curveLinear);
  const prepared: PreparedChartSeries[] = [];
  for (const item of ordered) {
    const markers = [];
    for (let index = 0; index < item.points.length; index += 1) {
      const point = item.points[index];
      if (!point || point.y === null) continue;
      const x = xScale(point.x);
      const y = yScale(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return invalidDomain;
      const before = item.points[index - 1];
      const after = item.points[index + 1];
      if ((!before || before.y === null) && (!after || after.y === null)) {
        markers.push({ x, y, point });
      }
    }
    const path = pathFor(item.points);
    if (path !== null && /NaN|Infinity/.test(path)) return invalidDomain;
    prepared.push({ id: item.id, label: item.label, points: item.points, path, markers });
  }
  const baseline =
    baselineY === undefined ? undefined : { value: baselineY, position: yScale(baselineY) };
  if (baseline !== undefined && !Number.isFinite(baseline.position)) return invalidDomain;
  return {
    kind: 'ready',
    width,
    height,
    plot,
    xDomain,
    yDomain,
    xTicks,
    yTicks,
    ...(baseline ? { baseline } : {}),
    series: prepared,
  };
}
