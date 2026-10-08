import type { ComparisonDateNavigationStylePart } from './types';

/** Segmented input and calendar use the shared surface, interaction and 44px control tokens. */
export const navigationStyles: Record<ComparisonDateNavigationStylePart, string> = {
  group: 'mt-pharo-2 flex flex-wrap items-end gap-pharo-2',
  picker: 'min-w-0 grow',
  labelRow: 'mb-pharo-1 flex items-center justify-between gap-pharo-2',
  label: 'text-pharo-xs font-medium text-pharo-muted',
  latest: 'text-pharo-xs font-medium text-pharo-action',
  field:
    'flex min-h-pharo-control items-center rounded-pharo-control border border-pharo-control-border bg-pharo-surface invalid:border-pharo-error disabled:bg-pharo-disabled-surface',
  input: 'flex grow items-center px-pharo-3 text-pharo-sm text-pharo-foreground',
  segment:
    'rounded-pharo-control px-pharo-1 py-pharo-2 tabular-nums outline-none focus:bg-pharo-selected focus:text-pharo-action focus-visible:pharo-focus-ring placeholder:text-pharo-muted disabled:text-pharo-disabled-foreground',
  trigger: 'border-0',
  arrow: 'w-pharo-control px-0',
  back: 'text-pharo-xs',
  error: 'mt-pharo-1 text-pharo-xs text-pharo-error',
  popover:
    'z-50 max-w-[calc(100vw-var(--spacing-pharo-2))] rounded-pharo-control border border-pharo-control-border bg-pharo-surface pharo-shadow-overlay',
  dialog: 'outline-none',
  calendar: 'text-pharo-sm text-pharo-foreground',
  calendarHeader: 'mb-pharo-2 flex items-center justify-between gap-pharo-2 px-pharo-1 pt-pharo-1',
  heading: 'text-pharo-sm font-semibold',
  grid: 'w-full border-collapse [&_th]:pb-pharo-1 [&_th]:text-pharo-xs [&_th]:font-medium [&_th]:text-pharo-muted [&_td]:p-0',
  cell: 'flex size-pharo-control cursor-default items-center justify-center rounded-pharo-control tabular-nums outline-none hover:bg-pharo-selected focus-visible:pharo-focus-ring selected:pharo-selected-action disabled:text-pharo-disabled-foreground disabled:opacity-50 unavailable:text-pharo-muted unavailable:line-through outside-month:invisible',
};
