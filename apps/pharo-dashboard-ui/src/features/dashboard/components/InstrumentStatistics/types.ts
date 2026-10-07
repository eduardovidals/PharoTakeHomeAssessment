import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiFailure } from '../../../../api/types';
import type { PriceStats } from '../../../../api/prices';

/** Current statistics for one route-selected, canonical instrument. */
export interface InstrumentStatisticsProps {
  /** Canonical ticker identifying this resource and its accessible region. */
  readonly ticker: string;
  /** Dashboard-owned Query result; this view never starts another request. */
  readonly query: UseQueryResult<PriceStats, ApiFailure>;
}

/** The finite visual responsibilities in the statistics panel. */
export type InstrumentStatisticsStylePart =
  | 'resource'
  | 'heading'
  | 'metrics'
  | 'metric'
  | 'label'
  | 'value'
  | 'explanation'
  | 'retry'
  | 'loading'
  | 'error';
