import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiFailure } from '../../../../api/types';
import type { PriceSeries } from '../../../../api/prices';

/** A selected identity and its independently cached current price result. */
export interface PriceHistoryResource {
  /** Canonical route-selected ticker, including pending or failed histories. */
  readonly ticker: string;
  /** Dashboard-owned history result; this panel issues no duplicate request. */
  readonly query: UseQueryResult<PriceSeries, ApiFailure>;
}

/** Ordered selected resources for raw-price comparison and individual summaries. */
export interface PriceHistoryProps {
  /** All current identities, with each result still owned by Query. */
  readonly resources: readonly PriceHistoryResource[];
}

/** The finite visual responsibilities in the history panel. */
export type PriceHistoryStylePart =
  | 'panel'
  | 'heading'
  | 'description'
  | 'summaries'
  | 'resource'
  | 'resourceHeading'
  | 'values'
  | 'label'
  | 'value'
  | 'retry'
  | 'loading'
  | 'error'
  | 'notice';
