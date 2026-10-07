import type { PharoChartAppearance } from './types';

export const containerStyles =
  'relative h-pharo-chart-height w-full min-w-0 bg-pharo-surface font-pharo-body text-pharo-xs text-pharo-foreground';
export const svgStyles = 'block h-full w-full overflow-hidden';
export const axisStyles = 'fill-pharo-muted text-pharo-xs';
export const axisLabelStyles = 'fill-pharo-foreground text-pharo-xs font-medium';
export const boundsStyles = 'fill-none stroke-pharo-control-border';
export const statusStyles =
  'flex h-full items-center justify-center px-pharo-4 text-center text-pharo-sm text-pharo-muted';

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
