import type { ChartGeometry } from '../../types';

/** @internal Chart inputs for one instance's recorded-observation interaction. */
export interface UseChartInspectionOptions {
  /** Current geometry; unavailable space preserves a prior explicit selection. */
  readonly geometry: ChartGeometry;
  /** Chronological union of real recorded timestamps. */
  readonly timeline: readonly number[];
}

/** @internal Ownership of one potential touch tap, without preventing scrolling. */
export interface ChartTouchGesture {
  /** Pointer identity used to ignore unrelated or cancelled touch events. */
  readonly pointerId: number;
  /** Initial client-space horizontal coordinate. */
  readonly startX: number;
  /** Initial client-space vertical coordinate. */
  readonly startY: number;
  /** A moved or multi-pointer gesture is never committed as a tap. */
  readonly moved: boolean;
}
