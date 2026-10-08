export const styles: Record<
  | 'root'
  | 'details'
  | 'date'
  | 'list'
  | 'item'
  | 'name'
  | 'value'
  | 'control'
  | 'label'
  | 'range'
  | 'help',
  string
> = {
  root: 'mt-pharo-2 min-w-0',
  details: 'flex min-w-0 flex-wrap items-baseline gap-x-pharo-4 gap-y-pharo-1 text-pharo-sm',
  date: 'min-w-0 break-words font-medium text-pharo-foreground',
  list: 'flex min-w-0 flex-1 flex-wrap gap-x-pharo-4 gap-y-pharo-1',
  item: 'flex min-w-0 max-w-full flex-wrap items-baseline gap-x-pharo-2',
  name: 'min-w-0 break-words text-pharo-muted',
  value: 'min-w-0 break-words font-medium tabular-nums text-pharo-foreground',
  control: 'group mt-pharo-1 min-w-0',
  label: 'sr-only',
  range: 'block min-h-pharo-control w-full accent-pharo-action focus-visible:pharo-focus-ring',
  help: 'sr-only text-pharo-xs text-pharo-muted group-focus-within:not-sr-only',
};
