/** One mobile-first toolbar; native popup results overlay the analysis surface. */
export const toolbarStyles: Record<'root' | 'controls' | 'range' | 'count' | 'error', string> = {
  root: 'grid min-w-0 items-start gap-pharo-4 border-b border-pharo-border pb-pharo-4 lg:grid-cols-[minmax(0,1fr)_auto]',
  controls: 'flex min-w-0 flex-col gap-pharo-2 lg:w-pharo-matrix',
  range: 'flex flex-wrap gap-x-pharo-2 text-pharo-xs text-pharo-muted',
  count: 'tabular-nums',
  error: 'text-pharo-sm text-pharo-error',
};
