import type { PharoButtonSize, PharoButtonVariant } from './types';

export const baseStyles =
  'inline-flex min-h-pharo-control shrink-0 items-center justify-center gap-pharo-2 rounded-pharo-control border font-pharo-body font-medium pharo-transition-colors focus-visible:pharo-focus-ring disabled:cursor-not-allowed pending:cursor-wait';

export const variantStyles: Record<PharoButtonVariant, string> = {
  primary:
    'border-pharo-action bg-pharo-action text-pharo-on-action hover:border-pharo-action-hover hover:bg-pharo-action-hover pressed:border-pharo-action-active pressed:bg-pharo-action-active pending:bg-pharo-action-hover disabled:border-pharo-control-border disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground',
  secondary:
    'border-pharo-control-border bg-pharo-surface text-pharo-foreground hover:bg-pharo-surface-quiet pressed:bg-pharo-selected disabled:border-pharo-control-border disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground',
  quiet:
    'border-transparent bg-transparent text-pharo-action hover:bg-pharo-selected pressed:bg-pharo-surface-quiet disabled:text-pharo-disabled-foreground',
};

export const sizeStyles: Record<PharoButtonSize, string> = {
  sm: 'ps-pharo-3 pe-pharo-3 text-pharo-sm',
  md: 'ps-pharo-4 pe-pharo-4 text-pharo-base',
};
