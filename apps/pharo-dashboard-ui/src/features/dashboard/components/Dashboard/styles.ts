import type { DashboardStylePart } from './types';
import type { PharoChartAppearance } from '@pharo/react-charts';

/** Identity marks use the same shared color/dash roles as the chart. */
export const appearanceStyles: Record<PharoChartAppearance, string> = {
  primary:
    'inline-block h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-1 [stroke-dasharray:var(--pharo-chart-dash-1)]',
  secondary:
    'inline-block h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-2 [stroke-dasharray:var(--pharo-chart-dash-2)]',
  tertiary:
    'inline-block h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-3 [stroke-dasharray:var(--pharo-chart-dash-3)]',
};

/** Complete semantic classes for the branded shell and responsive analysis layout. */
export const dashboardStyles: Record<DashboardStylePart, string> = {
  page: 'mx-auto flex w-full max-w-pharo-workspace flex-col gap-pharo-4 px-pharo-4 pb-pharo-4 sm:px-pharo-6',
  header:
    'flex min-h-pharo-header flex-wrap items-center justify-between gap-x-pharo-4 gap-y-pharo-1 border-b border-pharo-border py-pharo-3',
  identity: 'flex min-w-0 items-center gap-pharo-3',
  wordmark: 'text-pharo-lg font-semibold tracking-widest text-pharo-brand-navy',
  heading:
    'border-s-2 border-pharo-brand-cyan ps-pharo-3 text-pharo-base font-semibold text-pharo-foreground sm:text-pharo-lg',
  descriptor: 'text-pharo-xs text-pharo-muted',
  analysis: 'flex min-w-0 flex-col gap-pharo-4',
  selectionHeading: 'sr-only',
  subheading:
    'flex min-w-0 items-center gap-pharo-2 break-words text-pharo-lg font-semibold text-pharo-foreground',
  ticker: 'min-w-0 break-all',
  selection: 'grid min-w-0 gap-pharo-4',
  article: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  notice:
    'rounded-pharo-control border border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 text-pharo-sm text-pharo-foreground',
  error: 'mt-pharo-2 break-words text-pharo-sm text-pharo-error',
  empty:
    'flex flex-col gap-pharo-2 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4 text-pharo-sm text-pharo-muted',
};
