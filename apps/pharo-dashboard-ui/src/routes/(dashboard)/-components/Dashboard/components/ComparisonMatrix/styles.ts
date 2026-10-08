import type { PharoChartAppearance } from '@pharo/react-charts';
import type { ComparisonStylePart, ComparisonValue } from './types';

/** Shared categorical roles and line patterns agree with chart and selected tags. */
export const appearanceStyles: Record<PharoChartAppearance, string> = {
  primary:
    'h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-1 [stroke-dasharray:var(--pharo-chart-dash-1)]',
  secondary:
    'h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-2 [stroke-dasharray:var(--pharo-chart-dash-2)]',
  tertiary:
    'h-pharo-3 w-pharo-6 shrink-0 stroke-pharo-chart-3 [stroke-dasharray:var(--pharo-chart-dash-3)]',
};

/** Financial return signs remain textual; volatility and drawdown stay neutral. */
export const valueStyles: Record<ComparisonValue['tone'], string> = {
  neutral: 'text-pharo-foreground',
  positive: 'text-pharo-positive',
  negative: 'text-pharo-negative',
};

/** Mobile-first table uses its own horizontal scrolling instead of overflowing the page. */
export const matrixStyles: Record<ComparisonStylePart, string> = {
  panel: 'min-w-0 rounded-pharo-card border border-pharo-border bg-pharo-surface p-pharo-4',
  heading: 'text-pharo-base font-semibold text-pharo-foreground outline-pharo-focus',
  description: 'mt-pharo-1 text-pharo-xs text-pharo-muted',
  periods: 'mt-pharo-1 space-y-pharo-1 text-pharo-xs text-pharo-muted',
  announcement: 'sr-only',
  scrollHint: 'mt-pharo-3 text-pharo-xs text-pharo-muted',
  scroll:
    'mt-pharo-3 overflow-x-auto rounded-pharo-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pharo-focus',
  table: 'w-full border-separate border-spacing-0 text-pharo-sm',
  columnHeader:
    'border-b border-pharo-border px-pharo-2 py-pharo-3 text-end font-semibold text-pharo-foreground',
  identity: 'flex items-center justify-end gap-pharo-1',
  ticker: 'whitespace-nowrap',
  rowHeader:
    'sticky start-0 z-10 border-b border-pharo-border bg-pharo-surface py-pharo-3 pe-pharo-3 text-start font-medium whitespace-nowrap text-pharo-foreground',
  value:
    'border-b border-pharo-border px-pharo-2 py-pharo-3 text-end font-pharo-mono whitespace-nowrap tabular-nums',
  statusCell: 'px-pharo-2 pt-pharo-3 align-top text-pharo-xs text-pharo-muted',
  feedback: 'flex flex-col gap-pharo-2 break-words',
  error: 'mt-pharo-2 text-pharo-sm text-pharo-error',
  action: 'max-w-full whitespace-normal break-words',
  help: 'mt-pharo-3 text-pharo-xs text-pharo-muted',
};
