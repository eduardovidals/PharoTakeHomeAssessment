import type { DateValue } from '@internationalized/date';

/** Preserve an unavailable typed date while its segments are being corrected. */
export interface UnavailableDateEntry {
  readonly value: DateValue;
  readonly selectedTimestamp: number | null;
  readonly latestTimestamp: number | undefined;
}

/** Controlled navigation over dates already present in cached selected histories. */
export interface ComparisonDateNavigationProps {
  /** Null keeps the full-window Latest view; the dashboard remains the sole pin owner. */
  readonly selectedTimestamp: number | null;
  /** Sorted, unique recorded dates. */
  readonly timeline: readonly number[];
  /** Request a change from the dashboard's sole date owner. */
  readonly onTimestampChange: (timestamp: number | null) => void;
}

/** Static parts of the date-navigation surface. */
export type ComparisonDateNavigationStylePart =
  | 'group'
  | 'picker'
  | 'labelRow'
  | 'label'
  | 'latest'
  | 'description'
  | 'field'
  | 'input'
  | 'segment'
  | 'trigger'
  | 'arrow'
  | 'back'
  | 'error'
  | 'popover'
  | 'dialog'
  | 'calendar'
  | 'calendarHeader'
  | 'heading'
  | 'grid'
  | 'cell';
