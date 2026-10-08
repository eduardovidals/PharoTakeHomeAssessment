import type { PharoChartAppearance } from '@pharo/react-charts';

/** Compact picker support and recovery controls. */
export const pickerStyles: Record<'root' | 'actions' | 'help' | 'error', string> = {
  root: 'min-w-0 flex-1',
  actions: 'mt-pharo-2 flex flex-wrap items-center gap-pharo-2',
  help: 'text-pharo-sm text-pharo-muted',
  error: 'mt-pharo-2 text-pharo-sm text-pharo-error',
};

/** Token-owned color and non-color line cues accompany every selected tag. */
export const appearanceStyles: Record<PharoChartAppearance, string> = {
  primary:
    "before:block before:ms-pharo-2 before:w-pharo-4 before:shrink-0 before:border-t-2 before:border-solid before:border-pharo-chart-1 before:content-['']",
  secondary:
    "before:block before:ms-pharo-2 before:w-pharo-4 before:shrink-0 before:border-t-2 before:border-dashed before:border-pharo-chart-2 before:content-['']",
  tertiary:
    "before:block before:ms-pharo-2 before:w-pharo-4 before:shrink-0 before:border-t-2 before:border-dotted before:border-pharo-chart-3 before:content-['']",
};
