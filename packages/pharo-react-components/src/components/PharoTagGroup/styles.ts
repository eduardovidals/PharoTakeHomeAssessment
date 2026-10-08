export const tagStyles: Record<'group' | 'list' | 'tag' | 'text' | 'remove' | 'symbol', string> = {
  group: 'min-w-0',
  list: 'flex min-w-0 flex-wrap gap-pharo-2 outline-none',
  tag: 'flex min-h-pharo-control max-w-full items-center gap-pharo-1 rounded-pharo-control border border-pharo-control-border bg-pharo-surface text-pharo-sm text-pharo-foreground outline-none focus-visible:pharo-focus-ring disabled:text-pharo-disabled-foreground',
  text: 'min-w-0 wrap-break-word px-pharo-1 py-pharo-2',
  remove:
    'flex size-pharo-control shrink-0 items-center justify-center rounded-pharo-control text-pharo-muted pharo-transition-colors hover:bg-pharo-selected hover:text-pharo-action pressed:bg-pharo-selected focus-visible:pharo-focus-ring disabled:cursor-not-allowed disabled:text-pharo-disabled-foreground',
  symbol: 'text-pharo-lg',
};
