export const styles: Record<
  'region' | 'table' | 'caption' | 'header' | 'dateHeader' | 'date' | 'cell' | 'status',
  string
> = {
  region:
    'min-w-0 max-w-full overflow-x-auto rounded-pharo-control border border-pharo-border bg-pharo-surface font-pharo-body text-pharo-foreground focus-visible:pharo-focus-ring',
  table: 'w-full min-w-96 table-fixed border-collapse text-pharo-sm',
  caption: 'p-pharo-3 text-start font-medium',
  header:
    'border-b border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 align-top break-words text-end font-medium',
  dateHeader:
    'w-32 border-b border-pharo-control-border bg-pharo-surface-quiet px-pharo-3 py-pharo-2 align-top text-start font-medium',
  date: 'border-b border-pharo-border px-pharo-3 py-pharo-2 align-top break-words text-start font-normal',
  cell: 'border-b border-pharo-border px-pharo-3 py-pharo-2 align-top break-words text-end font-pharo-mono tabular-nums',
  status: 'px-pharo-3 py-pharo-4 text-pharo-sm text-pharo-muted',
};
