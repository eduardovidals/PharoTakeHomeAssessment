/** Controlled navigation over dates already present in cached selected histories. */
export interface ComparisonDateNavigationProps {
  /** Null keeps the full-window Latest view; no local date state is introduced. */
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
