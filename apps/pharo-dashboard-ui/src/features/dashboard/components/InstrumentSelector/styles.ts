import type { InstrumentSelectorStylePart } from './types';

/** Semantic layout shared by loading, browsing and selected-chip states. */
export const selectorStyles: Record<InstrumentSelectorStylePart, string> = {
  panel: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  heading: 'text-pharo-lg font-semibold text-pharo-foreground',
  description: 'text-pharo-sm text-pharo-muted',
  search: 'mt-pharo-4',
  actions: 'mt-pharo-2 flex flex-wrap gap-pharo-2',
  selection: 'mt-pharo-4 border-b border-pharo-border pb-pharo-4',
  chips: 'mt-pharo-2 flex flex-col gap-pharo-2',
  chip: 'w-full min-w-0 justify-between whitespace-normal break-all text-start',
  results: 'mt-pharo-4 grid max-h-96 gap-pharo-2 overflow-y-auto p-pharo-2',
  result: 'w-full min-w-0 justify-between gap-pharo-2 whitespace-normal text-start',
  actionLabel: 'shrink-0',
  ticker: 'min-w-0 break-all font-pharo-mono',
  pagination: 'mt-pharo-2 flex flex-wrap items-center justify-between gap-pharo-2',
  notice: 'mt-pharo-2 text-pharo-sm text-pharo-foreground',
  error: 'mt-pharo-4 text-pharo-sm text-pharo-error',
  loading: 'mt-pharo-4 flex items-center gap-pharo-2 text-pharo-sm text-pharo-muted',
};
