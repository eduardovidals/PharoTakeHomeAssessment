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
  page: 'mx-auto flex w-full max-w-7xl flex-col gap-pharo-6 p-pharo-4 sm:p-pharo-8',
  hero: 'rounded-pharo-card border-b-4 border-pharo-brand-cyan bg-pharo-brand-navy p-pharo-6 text-pharo-brand-white sm:p-pharo-8',
  brandRow: 'mb-pharo-6 flex flex-wrap items-center justify-between gap-pharo-3',
  wordmark: 'text-pharo-lg font-semibold tracking-widest',
  descriptor: 'text-pharo-xs tracking-wide',
  heading: 'font-pharo-body text-pharo-title font-semibold sm:text-pharo-display',
  description: 'mt-pharo-3 max-w-2xl text-pharo-sm',
  layout: 'grid items-start gap-pharo-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,3fr)]',
  analysis: 'flex min-w-0 flex-col gap-pharo-4',
  header: 'flex flex-wrap items-center justify-between gap-pharo-2',
  subheading:
    'flex min-w-0 items-center gap-pharo-2 break-words text-pharo-lg font-semibold text-pharo-foreground',
  ticker: 'min-w-0 break-all',
  count: 'text-pharo-sm text-pharo-muted',
  selection: 'grid min-w-0 gap-pharo-4',
  article: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  notice:
    'rounded-pharo-control border border-pharo-control-border bg-pharo-surface-quiet p-pharo-4 text-pharo-sm text-pharo-foreground',
  error: 'mt-pharo-2 break-words text-pharo-sm text-pharo-error',
  empty:
    'flex min-h-64 flex-col justify-center gap-pharo-4 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-6 text-pharo-base text-pharo-muted sm:p-pharo-8',
  hint: 'max-w-xl text-pharo-sm',
};
