import type { DashboardStylePart } from './types';

/** Static semantic styling for the application dashboard and resource summaries. */
export const dashboardStyles: Record<DashboardStylePart, string> = {
  page: 'mx-auto flex w-full max-w-6xl flex-col gap-pharo-8 p-pharo-4 sm:p-pharo-8',
  heading: 'font-pharo-body text-pharo-title font-semibold text-pharo-foreground',
  subheading: 'text-pharo-lg font-semibold text-pharo-foreground',
  description: 'text-pharo-sm text-pharo-muted',
  panel: 'rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  header: 'flex flex-wrap items-center justify-between gap-pharo-4',
  instruments:
    'mt-pharo-4 grid max-h-80 grid-cols-2 gap-pharo-2 overflow-auto sm:grid-cols-4 lg:grid-cols-6',
  selection: 'mt-pharo-4 grid gap-pharo-4 lg:grid-cols-3',
  article: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  resource: 'mt-pharo-4 border-t border-pharo-border pt-pharo-4',
  resourceHeading: 'mb-pharo-2 font-semibold text-pharo-foreground',
  values: 'grid gap-pharo-2 text-pharo-sm',
  value: 'break-words font-pharo-mono text-pharo-base text-pharo-foreground',
  notice:
    'rounded-pharo-control border border-pharo-control-border bg-pharo-surface-quiet p-pharo-4 text-pharo-sm text-pharo-foreground',
  error: 'mb-pharo-2 text-pharo-sm text-pharo-error',
  loading: 'flex items-center gap-pharo-2 text-pharo-sm text-pharo-muted',
  empty: 'mt-pharo-4 text-pharo-base text-pharo-muted',
};
