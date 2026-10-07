import type { ApiClient } from '../../../../api/types';
import type { SelectionAddOutcome, SelectionNotice } from '../../../../app/types';

/** URL-owned selection and application-owned transport for the market dashboard. */
export interface DashboardProps {
  /** The same configured client held in this application's Router context. */
  readonly apiClient: ApiClient;
  /** Canonical URL selection in comparison order; the route enforces the limit. */
  readonly selectedTickers: readonly string[];
  /** Safe explanation of the current direct link's normalization, when needed. */
  readonly selectionNotice?: SelectionNotice;
  /** Commit a selection through the route and report duplicate or limit no-ops. */
  readonly onSelect: (ticker: string) => Promise<SelectionAddOutcome>;
  /** Remove a ticker through normal URL navigation. */
  readonly onRemove: (ticker: string) => Promise<void>;
  /** Navigate to the meaningful no-selection state. */
  readonly onClear: () => Promise<void>;
}

/** Named static visual parts of the dashboard. */
export type DashboardStylePart =
  | 'page'
  | 'hero'
  | 'brandRow'
  | 'wordmark'
  | 'descriptor'
  | 'heading'
  | 'subheading'
  | 'description'
  | 'layout'
  | 'analysis'
  | 'header'
  | 'count'
  | 'selection'
  | 'article'
  | 'notice'
  | 'error'
  | 'empty'
  | 'hint';
