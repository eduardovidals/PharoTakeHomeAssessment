import type { PriceHistoryStylePart } from './types';

/** Complete semantic utilities for the chart and stable plot placeholder. */
export const historyStyles: Record<PriceHistoryStylePart, string> = {
  panel: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  heading: 'text-pharo-lg font-semibold text-pharo-foreground',
  description: 'mt-pharo-1 mb-pharo-4 break-words text-pharo-sm text-pharo-muted',
  chart: 'h-pharo-plot-mobile sm:h-pharo-plot-desktop xl:h-pharo-plot-compact',
  placeholder:
    'flex min-h-pharo-plot-mobile items-center justify-center break-words text-center text-pharo-sm text-pharo-muted sm:min-h-pharo-plot-desktop xl:min-h-pharo-plot-compact',
  notice: 'mb-pharo-2 break-words text-pharo-sm text-pharo-muted',
};
