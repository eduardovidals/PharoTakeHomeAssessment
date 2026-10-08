import type { ComparisonDateNavigationStylePart } from './types';

/** All controls retain the shared 44px target; date options are native React Aria items. */
export const navigationStyles: Record<ComparisonDateNavigationStylePart, string> = {
  group: 'mt-pharo-2 flex flex-wrap items-end gap-pharo-2',
  select: 'min-w-0 grow',
  label: 'mb-pharo-1 block text-pharo-xs font-medium text-pharo-muted',
  trigger: 'w-full justify-between',
  arrow: 'w-pharo-control px-0',
  back: 'text-pharo-xs',
  popover:
    'z-50 min-w-(--trigger-width) rounded-pharo-control border border-pharo-control-border bg-pharo-surface pharo-shadow-overlay',
  list: 'max-h-pharo-plot-mobile overflow-auto p-pharo-2 outline-none',
  option:
    'flex min-h-pharo-control cursor-default items-center rounded-pharo-control px-pharo-3 py-pharo-2 text-pharo-sm text-pharo-foreground outline-none focus:bg-pharo-selected focus:text-pharo-action focus-visible:pharo-focus-ring selected:bg-pharo-action selected:text-pharo-on-action',
};
