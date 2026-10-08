import type { PharoChartSeries } from '@pharo/react-charts';

/** Raw cached observations with a stable trigger shared by the chart association. */
export interface ObservationDialogProps {
  /** Unique actual trigger ID owned by the containing dashboard. */
  readonly triggerId: string;
  /** Ordered raw price series, including selected identities without available records. */
  readonly series: readonly PharoChartSeries[];
}

/** Static semantic presentation for raw data explanation and per-instrument windows. */
export type ObservationDialogStylePart =
  'trigger' | 'content' | 'description' | 'windows' | 'window' | 'table';
