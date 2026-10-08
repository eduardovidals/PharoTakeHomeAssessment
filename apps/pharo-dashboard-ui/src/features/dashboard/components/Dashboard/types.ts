import type { ApiClient } from '../../../../api/types';
import type {
  ChartMode,
  DashboardAction,
  DashboardActionOutcome,
  SelectionNotice,
} from '../../../../app/types';

/** URL-owned selection and application-owned transport for the market dashboard. */
export interface DashboardProps {
  /** The same configured client held in this application's Router context. */
  readonly apiClient: ApiClient;
  /** Canonical URL selection in comparison order; the route enforces the limit. */
  readonly selectedTickers: readonly string[];
  /** Effective chart mode derived from canonical URL search. */
  readonly mode: ChartMode;
  /** Safe explanation of the current direct link's normalization, when needed. */
  readonly selectionNotice?: SelectionNotice;
  /** Commit a selection or explicit view intention through the route's single queue. */
  readonly onAction: (action: DashboardAction) => Promise<DashboardActionOutcome>;
}

/** Named static visual parts of the dashboard. */
export type DashboardStylePart =
  | 'page'
  | 'header'
  | 'identity'
  | 'wordmark'
  | 'descriptor'
  | 'heading'
  | 'subheading'
  | 'analysis'
  | 'selectionHeading'
  | 'notice'
  | 'workspace'
  | 'empty';
