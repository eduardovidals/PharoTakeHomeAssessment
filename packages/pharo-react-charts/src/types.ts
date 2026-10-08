/** A recorded UTC epoch-millisecond observation; null explicitly means missing. */
export interface PharoChartPoint {
  /** Integer UTC epoch milliseconds within JavaScript's valid Date range. */
  readonly x: number;
  /** A finite numerical observation, or null to break the line at missing data. */
  readonly y: number | null;
}

/** Three semantic color and dash identities, independent of array order. */
export type PharoChartAppearance = 'primary' | 'secondary' | 'tertiary';

/** Generic observations with a stable, nonblank identifier and readable label. */
export interface PharoChartSeries {
  /** Nonblank exact identity retained across additions, removals and reordering. */
  readonly id: string;
  /** Nonblank, human-readable description of this series. */
  readonly label: string;
  /** Readonly observations; consumers sort a copy and reject duplicate times. */
  readonly points: readonly PharoChartPoint[];
  /** Optional explicit identity; active series must have distinct appearances. */
  readonly appearance?: PharoChartAppearance;
}

/** @internal Validated chronological records without requiring drawable geometry. */
export type ChartRecords =
  | {
      /** Valid records, including empty series and all-null observations. */
      readonly kind: 'ready';
      /** Chronological copies preserving original identities, appearances and values. */
      readonly series: readonly PharoChartSeries[];
    }
  | {
      /** Invalid identity, appearance, timestamp, duplicate or numerical value. */
      readonly kind: 'invalid';
      /** Safe explanation that never interpolates invalid source data. */
      readonly message: string;
    };

/** @internal One series' exact value, explicit missing record or absent record. */
export type ChartInspectionRow = {
  /** Exact series identity associated with this observation. */
  readonly id: string;
  /** Full series label used in details and accessible value text. */
  readonly label: string;
} & (
  | {
      /** A defined observation exists at the inspected timestamp. */
      readonly kind: 'available';
      /** Unrounded recorded value, never an interpolated estimate. */
      readonly value: number;
    }
  | {
      /** Distinguishes an explicit null from a date absent in this series. */
      readonly kind: 'missing' | 'absent';
      /** Unavailable values must never be formatted as zero. */
      readonly value: null;
    }
);
