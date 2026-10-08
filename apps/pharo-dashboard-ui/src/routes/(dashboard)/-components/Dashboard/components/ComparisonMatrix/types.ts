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
