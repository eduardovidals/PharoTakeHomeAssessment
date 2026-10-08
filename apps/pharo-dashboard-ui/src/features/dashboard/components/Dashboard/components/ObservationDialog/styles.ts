import type { ObservationDialogStylePart } from './types';

/** Let the existing modal own vertical scrolling and the generic table own horizontal scrolling. */
export const observationStyles: Record<ObservationDialogStylePart, string> = {
  trigger: 'self-start',
  content: 'flex min-w-0 flex-col gap-pharo-4',
  description: 'text-pharo-sm text-pharo-muted',
  windows: 'flex flex-col gap-pharo-2 text-pharo-sm text-pharo-foreground',
  window: 'break-words',
  table: '[&_thead_th]:whitespace-nowrap',
};
