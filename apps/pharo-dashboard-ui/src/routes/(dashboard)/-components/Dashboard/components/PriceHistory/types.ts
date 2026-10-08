import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiFailure } from '../../../../../../api/types';
import type { PriceSeries } from '../../../../../../api/prices';
import type { PharoChartAppearance } from '@pharo/react-charts';
import type { ChartMode } from '../../../../-state/types';

/** A selected identity and its independently cached current price result. */
export interface PriceHistoryResource {
  /** Canonical route-selected ticker, including pending or failed histories. */
  readonly ticker: string;
  /** Dashboard-owned history result; this panel issues no duplicate request. */
  readonly query: UseQueryResult<PriceSeries, ApiFailure>;
  /** Dashboard-owned identity shared with current selection and comparison columns. */
  readonly appearance?: PharoChartAppearance;
}

/** Ordered selected resources for chart comparison. */
export interface PriceHistoryProps {
  /** All current identities, with each result still owned by Query. */
  readonly resources: readonly PriceHistoryResource[];
  /** Effective route-owned view; standalone resource tests default to raw Price. */
  readonly mode?: ChartMode;
  /** Reachable application-owned raw-data disclosure; standalone charts retain inline data. */
  readonly externalDataTriggerId?: string;
  /** Dashboard-owned comparison date; null means Latest, omitted preserves standalone inspection. */
  readonly selectedTimestamp?: number | null;
  /** Only explicit chart clicks, taps and keyboard navigation commit a comparison date. */
  readonly onTimestampChange?: (timestamp: number) => void;
}

/** The finite visual responsibilities in the history panel. */
export type PriceHistoryStylePart =
  'panel' | 'heading' | 'description' | 'chart' | 'placeholder' | 'notice';
