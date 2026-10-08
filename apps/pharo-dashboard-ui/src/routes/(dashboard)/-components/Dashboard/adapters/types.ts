import type { PharoChartSeries } from '@pharo/react-charts';

/** Unrounded price change based on one actual positive observation. */
export interface ReadyPerformanceSeries {
  /** Discriminates usable transformed observations. */
  readonly kind: 'ready';
  /** Copied points preserving timestamps, gaps, identity and appearance. */
  readonly series: PharoChartSeries;
  /** Actual UTC epoch of this series' own first observed positive price. */
  readonly baseTimestamp: number;
}

/** A retained identity whose price change cannot be meaningfully computed. */
export interface UnavailablePerformanceSeries {
  /** Discriminates missing or invalid price-change data. */
  readonly kind: 'unavailable';
  /** Identity and recorded timestamps retained with unavailable numeric values. */
  readonly series: PharoChartSeries;
  /** Safe reason distinguishing absent prices, invalid base and nonfinite arithmetic. */
  readonly reason: 'no-observations' | 'invalid-base' | 'invalid-observation';
}

/** A transformed series either has a real positive base or an explicit unavailable reason. */
export type PerformanceSeriesResult = ReadyPerformanceSeries | UnavailablePerformanceSeries;

/** Actual recorded-window metadata, independent of the currently inspected chart date. */
export interface SeriesWindow {
  /** Stable identity shared with chart and resource metadata. */
  readonly id: string;
  /** Consumer-visible identity label. */
  readonly label: string;
  /** UTC epoch of the first recorded point, including an explicit null record. */
  readonly firstTimestamp: number;
  /** UTC epoch of the last recorded point. */
  readonly lastTimestamp: number;
  /** Count of supplied records; missing calendar days are never synthesized. */
  readonly observationCount: number;
  /** First observed positive price's date; absent when the base is unusable. */
  readonly baseTimestamp?: number;
}
