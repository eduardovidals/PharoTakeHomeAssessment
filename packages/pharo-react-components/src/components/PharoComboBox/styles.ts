export const fieldStyles = 'group flex min-w-0 flex-col gap-pharo-2';

export const labelStyles = 'text-pharo-sm font-medium text-pharo-foreground';

export const controlStyles = 'relative flex items-center';

export const inputStyles =
  'block min-h-pharo-control w-full rounded-pharo-control border border-pharo-control-border bg-pharo-surface ps-pharo-3 pe-pharo-12 py-pharo-2 font-pharo-body text-pharo-base text-pharo-foreground placeholder:text-pharo-muted pharo-transition-colors hover:border-pharo-action focus-visible:pharo-focus-ring group-read-only:bg-pharo-surface-quiet invalid:border-pharo-error disabled:cursor-not-allowed disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground';

export const triggerStyles =
  'absolute end-0 top-0 flex size-pharo-control items-center justify-center rounded-pharo-control text-pharo-action pharo-transition-colors hover:bg-pharo-selected focus-visible:pharo-focus-ring disabled:cursor-not-allowed disabled:text-pharo-disabled-foreground';

// React Aria measures this public popover variable; it is not an authored design value.
export const popoverStyles =
  'z-50 w-(--trigger-width) rounded-pharo-control border border-pharo-control-border bg-pharo-surface pharo-shadow-overlay';

export const listStyles = 'max-h-72 overflow-auto p-pharo-2 outline-none';

export const optionStyles =
  'flex min-h-pharo-control cursor-default items-center rounded-pharo-control ps-pharo-3 pe-pharo-3 py-pharo-2 text-pharo-sm text-pharo-foreground outline-none focus:bg-pharo-selected focus:text-pharo-action focus-visible:pharo-focus-ring selected:bg-pharo-action selected:text-pharo-on-action disabled:cursor-not-allowed disabled:text-pharo-disabled-foreground selected:disabled:bg-pharo-disabled-surface selected:disabled:text-pharo-disabled-foreground';

export const optionContentStyles = 'flex min-w-0 grow items-center justify-between gap-pharo-2';

export const optionTextStyles = 'break-words';

export const emptyStyles = 'p-pharo-3 text-pharo-sm text-pharo-muted';

export const descriptionStyles = 'text-pharo-sm text-pharo-muted';

export const errorStyles = 'text-pharo-sm text-pharo-error';
