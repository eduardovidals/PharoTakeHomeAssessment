import type { PharoChartAppearance } from './types';

export const containerStyles =
  'relative h-pharo-chart-height w-full min-w-0 bg-pharo-surface font-pharo-body text-pharo-xs text-pharo-foreground';

export const svgStyles = 'block h-full w-full overflow-hidden';

export const statusStyles =
  'flex h-full items-center justify-center px-pharo-4 text-center text-pharo-sm text-pharo-muted';

export const figureStyles = 'm-0 min-w-0 font-pharo-body text-pharo-foreground';

export const legendStyles = 'mb-pharo-3 flex flex-wrap gap-x-pharo-6 gap-y-pharo-2 text-pharo-sm';

export const legendItemStyles = 'flex min-w-0 items-start gap-pharo-2';

export const legendSampleStyles = 'mt-pharo-1 shrink-0';

export const labelStyles = 'min-w-0 break-words';

export const disclosureStyles =
  'mt-pharo-3 inline-flex min-h-pharo-control items-center justify-center rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-4 py-pharo-2 text-pharo-sm font-medium text-pharo-action hover:bg-pharo-selected focus-visible:pharo-focus-ring';

export const crosshairStyles = 'stroke-pharo-control-border';

export const inspectionOverlayStyles = 'pointer-events-none pharo-transition-transform';

export const inspectionMotionStyles = 'pharo-transition-transform';

export const inspectionMarkerStyles = 'stroke-pharo-surface';

export const baselineStyles = 'stroke-pharo-chart-baseline';

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
