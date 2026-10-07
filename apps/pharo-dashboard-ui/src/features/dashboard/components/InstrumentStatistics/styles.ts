import type { InstrumentStatisticsStylePart } from './types';

/** Complete semantic utilities for values, explanations and resource feedback. */
export const statisticsStyles: Record<InstrumentStatisticsStylePart, string> = {
  resource: 'min-w-0',
  heading: 'mb-pharo-3 text-pharo-base font-semibold text-pharo-foreground',
  metrics: 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-pharo-4',
  metric: 'min-w-0 rounded-pharo-control bg-pharo-surface-quiet p-pharo-3',
  label: 'mb-pharo-1 text-pharo-sm text-pharo-muted',
  value:
    'break-words font-pharo-mono text-pharo-lg font-semibold text-pharo-foreground tabular-nums',
  explanation: 'mt-pharo-2 break-words font-pharo-body text-pharo-xs font-normal text-pharo-muted',
  retry: 'block max-w-full whitespace-normal break-words',
  loading: 'flex items-center gap-pharo-2 text-pharo-sm text-pharo-muted',
  error: 'mb-pharo-3 break-words text-pharo-sm text-pharo-error',
};
