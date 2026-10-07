import type { PharoChartAppearance } from './types';

export const containerStyles =
  'relative h-pharo-chart-height w-full min-w-0 bg-pharo-surface font-pharo-body text-pharo-xs text-pharo-foreground';
export const svgStyles = 'block h-full w-full overflow-hidden';
export const axisStyles = 'fill-pharo-muted text-pharo-xs';
export const axisLabelStyles = 'fill-pharo-foreground text-pharo-xs font-medium';
export const boundsStyles = 'fill-none stroke-pharo-control-border';
export const statusStyles =
  'flex h-full items-center justify-center px-pharo-4 text-center text-pharo-sm text-pharo-muted';
export const figureStyles = 'm-0 min-w-0 font-pharo-body text-pharo-foreground';
export const legendStyles = 'mb-pharo-3 flex flex-wrap gap-x-pharo-6 gap-y-pharo-2 text-pharo-sm';
export const legendItemStyles = 'flex min-w-0 items-start gap-pharo-2';
export const legendSampleStyles = 'mt-pharo-1 shrink-0';
export const labelStyles = 'min-w-0 break-words';
export const inspectionStyles = 'mt-pharo-4 flex min-w-0 flex-col gap-pharo-2';
export const inspectionLabelStyles = 'text-pharo-sm font-medium';
export const rangeStyles =
  'block min-h-pharo-control w-full accent-pharo-action focus-visible:pharo-focus-ring';
export const helpStyles = 'text-pharo-xs text-pharo-muted';
export const detailsStyles =
  'mt-pharo-3 min-w-0 rounded-pharo-control border border-pharo-border bg-pharo-surface-quiet p-pharo-3';
export const dateStyles = 'mb-pharo-2 break-words text-pharo-sm font-medium';
export const detailListStyles =
  'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-pharo-3';
export const detailItemStyles = 'min-w-0';
export const detailLabelStyles = 'break-words text-pharo-xs text-pharo-muted';
export const detailValueStyles = 'break-words text-pharo-sm font-medium';
export const disclosureStyles =
  'mt-pharo-3 inline-flex min-h-pharo-control items-center justify-center rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-4 py-pharo-2 text-pharo-sm font-medium text-pharo-action hover:bg-pharo-selected focus-visible:pharo-focus-ring';
export const tableRegionStyles =
  'mt-pharo-3 max-w-full overflow-x-auto rounded-pharo-control border border-pharo-border focus-visible:pharo-focus-ring';
export const tableStyles = 'w-full min-w-96 table-fixed border-collapse text-left text-pharo-sm';
export const captionStyles = 'p-pharo-3 text-left font-medium';
export const tableHeaderStyles =
  'border-b border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 align-top break-words font-medium';
export const dateHeaderStyles =
  'w-32 border-b border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 align-top font-medium';
export const tableDateStyles =
  'border-b border-pharo-border px-pharo-3 py-pharo-2 align-top break-words font-pharo-mono font-normal';
export const tableCellStyles =
  'border-b border-pharo-border px-pharo-3 py-pharo-2 align-top break-words';
export const crosshairStyles = 'stroke-pharo-control-border';

export const lineStyles: Record<PharoChartAppearance, string> = {
  primary: 'fill-none stroke-pharo-chart-1',
  secondary: 'fill-none stroke-pharo-chart-2',
  tertiary: 'fill-none stroke-pharo-chart-3',
};
export const markerStyles: Record<PharoChartAppearance, string> = {
  primary: 'fill-pharo-chart-1',
  secondary: 'fill-pharo-chart-2',
  tertiary: 'fill-pharo-chart-3',
};
export const dashPatterns: Record<PharoChartAppearance, string> = {
  primary: 'var(--pharo-chart-dash-1)',
  secondary: 'var(--pharo-chart-dash-2)',
  tertiary: 'var(--pharo-chart-dash-3)',
};
