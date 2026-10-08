import type { DashboardStylePart } from './types';

/** Complete semantic classes for the branded shell and responsive analysis layout. */
export const dashboardStyles: Record<DashboardStylePart, string> = {
  page: 'mx-auto flex w-full max-w-pharo-workspace flex-col gap-pharo-3 px-pharo-4 pb-pharo-4 sm:px-pharo-6',
  header:
    'flex min-h-pharo-header flex-wrap items-center justify-between gap-x-pharo-4 gap-y-pharo-1 border-b border-pharo-border py-pharo-3',
  identity: 'flex min-w-0 items-center gap-pharo-3',
  wordmark: 'text-pharo-lg font-semibold tracking-widest text-pharo-brand-navy',
  heading:
    'border-s-2 border-pharo-brand-cyan ps-pharo-3 text-pharo-base font-semibold text-pharo-foreground sm:text-pharo-lg',
  descriptor: 'text-pharo-xs text-pharo-muted',
  analysis: 'flex min-w-0 flex-col gap-pharo-4',
  selectionHeading: 'sr-only',
  workspace: 'grid min-w-0 items-start gap-pharo-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]',
  details: 'flex min-w-0 flex-col gap-pharo-3',
  subheading:
    'flex min-w-0 items-center gap-pharo-2 break-words text-pharo-lg font-semibold text-pharo-foreground',
  notice:
    'rounded-pharo-control border border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 text-pharo-sm text-pharo-foreground',
  empty:
    'flex flex-col gap-pharo-2 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4 text-pharo-sm text-pharo-muted',
};
