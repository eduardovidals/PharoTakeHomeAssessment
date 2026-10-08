import type { PriceStats } from '../../../../../../../api/prices/types';

/** Raw observations and prefix statistics at an inclusive date cutoff. */
export interface HistoricalComparison {
  /** Exact date match only: never carry a previous close forward. */
  readonly closingPrice?: number;
  /** Undefined when no observations or nonfinite calculations are available. */
  readonly statistics?: PriceStats;
  /** Actual first included recorded date. */
  readonly firstTimestamp?: number;
  /** Actual final included recorded date, which can precede the cutoff. */
  readonly lastTimestamp?: number;
  /** Number of included raw observations. */
  readonly observationCount: number;
}
