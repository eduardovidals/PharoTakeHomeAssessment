import type { Ref } from 'react';
import type { PharoChartAppearance } from '@pharo/react-charts';
import type { ApiClient } from '../../../../../../api/types';
import type {
  ChartMode,
  DashboardAction,
  DashboardActionOutcome,
} from '../../../../../../app/types';
import type { SeriesWindow } from '../../../../adapters/types';

/** Selection, view and actual available-window context for one analytical toolbar. */
export interface DashboardToolbarProps {
  /** Existing application transport for the independently cached instrument list. */
  readonly apiClient: ApiClient;
  /** Ordered authoritative route selection, including unavailable identifiers. */
  readonly selectedTickers: readonly string[];
  /** Effective URL view, derived only when no explicit view exists. */
  readonly mode: ChartMode;
  /** Stable Dashboard-owned identity roles for selected tags. */
  readonly appearances: ReadonlyMap<string, PharoChartAppearance>;
  /** Available recorded histories; missing resources do not fabricate window context. */
  readonly windows: readonly SeriesWindow[];
  /** The actual editable input exposed to Dashboard for action focus restoration. */
  readonly pickerInputRef?: Ref<HTMLInputElement>;
  /** Route-owned intention queue shared by picker and chart view. */
  readonly onAction: (action: DashboardAction) => Promise<DashboardActionOutcome>;
}
