import type { PharoChartSeries } from '../../types';

/** Complete generic recorded observations, independent of plotting and business state. */
export interface PharoChartDataTableProps {
  /** Zero to three immutable series; selected empty identities remain column headers. */
  readonly series: readonly PharoChartSeries[];
  /** Accessible name and visible caption describing these supplied observations. */
  readonly caption: string;
  /** Visible date presentation; defaults to complete UTC dates. */
  readonly formatXTable?: (timestamp: number) => string;
  /** Optional complete spoken date, distinct from the visible table text. */
  readonly formatXAccessible?: (timestamp: number) => string;
  /** Visible number presentation without changing or rounding the source data. */
  readonly formatYTable?: (value: number) => string;
  /** Message for a valid collection with no recorded timestamps. */
  readonly emptyMessage?: string;
  /** Complete layout classes applied to the keyboard-scrollable region. */
  readonly className?: string;
}
