import type { PharoSpinnerSize } from './types';

export const rootStyles = 'inline-flex items-center justify-center';

export const ringStyles =
  'rounded-pharo-pill border-2 border-pharo-control-border border-t-pharo-action motion-safe:animate-spin motion-reduce:animate-none';

export const sizeStyles: Record<PharoSpinnerSize, string> = {
  sm: 'size-pharo-4',
  md: 'size-pharo-6',
};
