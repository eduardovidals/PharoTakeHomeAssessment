import type { PriceHistoryStylePart } from './types';

/** Complete semantic utilities for the chart and independent resource summaries. */
export const historyStyles: Record<PriceHistoryStylePart, string> = {
  panel: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  heading: 'text-pharo-lg font-semibold text-pharo-foreground',
  description: 'mt-pharo-1 mb-pharo-4 break-words text-pharo-sm text-pharo-muted',
  summaries: 'mt-pharo-6 grid min-w-0 gap-pharo-4',
  resource: 'min-w-0 rounded-pharo-control border border-pharo-border p-pharo-3',
  resourceHeading: 'mb-pharo-3 break-words text-pharo-base font-semibold text-pharo-foreground',
  values: 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-pharo-3',
  label: 'text-pharo-xs text-pharo-muted',
  value: 'break-words font-pharo-mono text-pharo-sm text-pharo-foreground tabular-nums',
  retry: 'block max-w-full whitespace-normal break-words',
  loading: 'flex items-center gap-pharo-2 text-pharo-sm text-pharo-muted',
  error: 'mb-pharo-3 break-words text-pharo-sm text-pharo-error',
  notice: 'break-words text-pharo-sm text-pharo-muted',
};
