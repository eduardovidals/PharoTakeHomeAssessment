import type { PharoChartAppearance } from '@pharo/react-charts';

/** Instance-owned presentation metadata, independent of data arrivals and URL ownership. */
export interface SeriesAppearanceState {
  /** Selection signature used only to detect a new allocation input. */
  readonly configuration: string;
  /** Current semantic slots for selected identifiers. */
  readonly active: ReadonlyMap<string, PharoChartAppearance>;
  /** Last assigned preference reused only when its slot remains free. */
  readonly history: ReadonlyMap<string, PharoChartAppearance>;
}
