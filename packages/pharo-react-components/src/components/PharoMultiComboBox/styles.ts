export const styles: Record<
  | 'root'
  | 'field'
  | 'label'
  | 'control'
  | 'input'
  | 'trigger'
  | 'help'
  | 'error'
  | 'popover'
  | 'list'
  | 'option'
  | 'content'
  | 'text'
  | 'state'
  | 'selection'
  | 'empty'
  | 'loading'
  | 'announcement'
  | 'spinner',
  string
> = {
  root: 'flex min-w-0 flex-col gap-pharo-2',
  field: 'group flex min-w-0 flex-col gap-pharo-2',
  label: 'text-pharo-sm font-medium text-pharo-foreground',
  control: 'relative flex min-w-0 items-center',
  input:
    'block min-h-pharo-control w-full rounded-pharo-control border border-pharo-control-border bg-pharo-surface ps-pharo-3 pe-pharo-12 py-pharo-2 font-pharo-body text-pharo-base text-pharo-foreground placeholder:text-pharo-muted pharo-transition-colors hover:border-pharo-action focus-visible:pharo-focus-ring group-read-only:bg-pharo-surface-quiet invalid:border-pharo-error disabled:cursor-not-allowed disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground',
  trigger:
    'absolute end-0 top-0 flex size-pharo-control items-center justify-center rounded-pharo-control text-pharo-action hover:bg-pharo-selected focus-visible:pharo-focus-ring disabled:cursor-not-allowed disabled:text-pharo-disabled-foreground',
  help: 'text-pharo-sm text-pharo-muted',
  error: 'text-pharo-sm text-pharo-error',
  // The measured trigger width and native overlay maximum height are runtime geometry.
  popover:
    'z-50 flex min-h-0 w-(--trigger-width) max-w-[calc(100vw-2*var(--spacing-pharo-2))] flex-col overflow-hidden rounded-pharo-control border border-pharo-control-border bg-pharo-surface pharo-shadow-overlay',
  list: 'min-h-0 max-h-pharo-plot-mobile space-y-pharo-1 overflow-auto overscroll-contain p-pharo-2 outline-none',
  option:
    'flex min-h-pharo-control cursor-default items-center rounded-pharo-control border border-transparent px-pharo-3 py-pharo-2 text-pharo-sm text-pharo-foreground outline-none focus:bg-pharo-selected focus:text-pharo-action focus-visible:pharo-focus-ring selected:pharo-selected-action disabled:cursor-not-allowed disabled:border-dashed disabled:border-pharo-control-border disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground',
  content: 'flex min-w-0 grow items-center justify-between gap-pharo-2',
  text: 'min-w-0 wrap-break-word',
  state: 'shrink-0 text-pharo-xs font-medium',
  selection: 'flex min-w-0 flex-wrap items-center gap-pharo-2',
  empty: 'p-pharo-3 text-pharo-sm text-pharo-muted',
  loading:
    'flex min-h-pharo-control items-center justify-center gap-pharo-2 p-pharo-3 text-pharo-sm text-pharo-muted',
  announcement: 'sr-only',
  spinner: 'inline-flex shrink-0',
};
