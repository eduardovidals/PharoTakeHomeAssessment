import type { ChartInspectionDetail } from '../../types';

/** Controlled recorded-date navigation and a compact readable value summary. */
export interface PharoChartInspectionProps {
  /** Full chart name used by its inspection and details landmarks. */
  readonly label: string;
  /** Sorted actual recorded timestamps, independent of axis sampling. */
  readonly timeline: readonly number[];
  /** Current recorded timestamp, owned by the parent chart. */
  readonly timestamp: number;
  /** Committed range position when visible details are a temporary pointer preview. */
  readonly navigationTimestamp?: number;
  /** Clears temporary preview when keyboard navigation takes focus. */
  readonly onNavigationFocus?: () => void;
  /** Complete visible detail-date output. */
  readonly date: string;
  /** Complete spoken date and values for the native range. */
  readonly valueText: string;
  /** Exact per-series values or explicit unavailable output. */
  readonly details: readonly ChartInspectionDetail[];
  /** Selects a timestamp from the supplied timeline. */
  readonly onInspect: (timestamp: number) => void;
}
