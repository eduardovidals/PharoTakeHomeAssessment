import type { PharoChartAppearance } from '@pharo/react-charts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiFailure } from '../../../../../../api/types';
import type { PriceSeries, PriceStats } from '../../../../../../api/prices';

/** Independently cached resources for one URL-ordered comparison column. */
export interface ComparisonColumn {
  /** Canonical selected ticker, including unknown IDs from a shared URL. */
  readonly ticker: string;
  /** Shared chart/tag identity, independent of resource arrival order. */
  readonly appearance?: PharoChartAppearance;
  /** Raw recorded history; the matrix never receives transformed plot data. */
  readonly prices: UseQueryResult<PriceSeries, ApiFailure>;
  /** Full supplied-window API statistics, in percentage points. */
  readonly statistics: UseQueryResult<PriceStats, ApiFailure>;
}

/** One semantic comparison table with app-owned navigation and Query results. */
export interface ComparisonMatrixProps {
  /** Columns retain the canonical URL order. */
  readonly columns: readonly ComparisonColumn[];
  /** Queue removal; the owning dashboard restores actual picker focus on commit. */
  readonly onRemove: (ticker: string) => Promise<void>;
  /** A pinned recorded UTC date; null/omitted preserves Latest API statistics. */
  readonly selectedTimestamp?: number | null;
  /** Sorted unique timestamps already present in the selected cached histories. */
  readonly timeline?: readonly number[];
  /** The dashboard owns the sole pinned date; this surface only requests changes. */
  readonly onTimestampChange?: (timestamp: number | null) => void;
}

/** Independent resource names used for feedback and targeted retry intentions. */
export type ComparisonResource = 'prices' | 'statistics';

/** The two existing Query result shapes consumed without another data store. */
export type ComparisonQuery = ComparisonColumn['prices'] | ComparisonColumn['statistics'];

/** Compact feedback for one remote resource. */
export interface ResourceFeedback {
  /** Safe visible message, omitted for healthy or obsolete cancelled resources. */
  readonly message?: string;
  /** Only transient transport or server failures offer retry. */
  readonly canRetry: boolean;
  /** The resource has a deterministic missing-instrument response. */
  readonly notFound: boolean;
}

/** Readable numeric presentation with optional sign-based return emphasis. */
export interface ComparisonValue {
  /** Display text only; original Query data is left unchanged. */
  readonly text: string;
  /** Return sign is redundant with readable signed text, never ticker identity. */
  readonly tone: 'neutral' | 'positive' | 'negative';
}

/** Shared periods collapse once; differing histories retain explicit ticker identity. */
export interface ComparisonPeriod {
  /** Omitted when every selected instrument shares the same recorded window. */
  readonly ticker?: string;
  /** Readable recorded range/count and any missing-cutoff observation context. */
  readonly text: string;
}

/** One required metric and its URL-ordered values. */
export interface ComparisonRow {
  /** Meaningful metric label used as the native row header. */
  readonly label: string;
  /** One display value for each supplied column. */
  readonly values: readonly ComparisonValue[];
}

/** Static semantic parts of the compact comparison surface. */
export type ComparisonStylePart =
  | 'panel'
  | 'heading'
  | 'description'
  | 'periods'
  | 'announcement'
  | 'scrollHint'
  | 'scroll'
  | 'table'
  | 'columnHeader'
  | 'identity'
  | 'ticker'
  | 'rowHeader'
  | 'value'
  | 'statusCell'
  | 'feedback'
  | 'error'
  | 'action'
  | 'help';
