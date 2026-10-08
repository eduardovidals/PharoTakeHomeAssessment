import { findNearestTimestamp } from '../../inspection';
import type { ReadyChartGeometry } from '../../types';

/** Map client-space input through the rendered SVG bounds to an actual recorded timestamp. */
export function findPointerTimestamp(
  geometry: ReadyChartGeometry,
  timeline: readonly number[],
  bounds: Pick<DOMRect, 'left' | 'width'>,
  clientX: number,
): number | undefined {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.width) ||
    bounds.width <= 0
  )
    return undefined;
  const proportion = (clientX - bounds.left) / bounds.width;
  if (!Number.isFinite(proportion)) return undefined;
  const svgX = Math.max(0, Math.min(1, proportion)) * geometry.width;
  const plotProportion = Math.max(
    0,
    Math.min(1, (svgX - geometry.plot.left) / (geometry.plot.right - geometry.plot.left)),
  );
  const candidate =
    (1 - plotProportion) * geometry.xDomain[0] + plotProportion * geometry.xDomain[1];
  return findNearestTimestamp(timeline, candidate);
}
