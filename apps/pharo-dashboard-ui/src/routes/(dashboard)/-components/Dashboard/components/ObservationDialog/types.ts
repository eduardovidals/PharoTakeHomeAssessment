import type { PharoChartSeries } from '@pharo/react-charts';
import type { SeriesWindow } from '../../adapters/types';

/** Raw cached observations with a stable trigger shared by the chart association. */
export interface ObservationDialogProps {
  /** Unique actual trigger ID owned by the containing dashboard. */
  readonly triggerId: string;
  /** Ordered raw price series, including selected identities without available records. */
  readonly series: readonly PharoChartSeries[];
}

/** Instruments whose recorded range, count and performance base can be described once. */
export interface ObservationWindowGroup {
  /** First instrument ID provides a stable rendering key. */
  readonly id: string;
  /** Selected instrument labels covered by this metadata. */
  readonly labels: readonly string[];
  /** Missing records stay separate from available datasets. */
  readonly window?: SeriesWindow;
}

/** Static semantic presentation for raw data explanation and recorded windows. */
export type ObservationDialogStylePart =
  'trigger' | 'content' | 'description' | 'windows' | 'window' | 'table';
