import type { ChartAxisLabel, ReadyChartGeometry } from '../../types';

/** Prepared coordinates and presentation for the chart's SVG axes. */
export interface PharoChartAxesProps {
  /** Validated shared plot geometry; this child does not prepare data or scales. */
  readonly geometry: ReadyChartGeometry;
  /** Readable x-axis subset retaining full formatter output in each title. */
  readonly xLabels: readonly ChartAxisLabel[];
  /** Independent numerical-axis formatter. */
  readonly formatYAxis: (value: number) => string;
  /** Optional date-axis units. */
  readonly xAxisLabel?: string;
  /** Optional value-axis units. */
  readonly yAxisLabel?: string;
}
