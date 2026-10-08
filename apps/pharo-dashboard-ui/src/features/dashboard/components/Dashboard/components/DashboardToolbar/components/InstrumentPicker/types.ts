import type { PharoChartAppearance } from '@pharo/react-charts';
import type { ApiClient } from '../../../../../../../../api/types';
import type { DashboardAction, DashboardActionOutcome } from '../../../../../../../../app/types';

/** Canonical app-owned option supplied to the generic picker. */
export interface InstrumentItem {
  /** Stable key and accessible label from the validated instrument list. */
  readonly ticker: string;
}

/** Bind the cached instrument list to authoritative route intentions. */
export interface InstrumentPickerProps {
  /** Existing application transport shared by the Query cache. */
  readonly apiClient: ApiClient;
  /** Current ordered URL keys, including identifiers absent from the list. */
  readonly selectedTickers: readonly string[];
  /** Dashboard-owned line identities retained across pending and filtered states. */
  readonly appearances: ReadonlyMap<string, PharoChartAppearance>;
  /** Commit an intention through the route's existing serialized action queue. */
  readonly onAction: (action: DashboardAction) => Promise<DashboardActionOutcome>;
}
