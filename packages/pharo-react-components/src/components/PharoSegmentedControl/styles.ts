export const segmentedStyles: Record<'group' | 'label' | 'options' | 'option', string> = {
  group: 'flex min-w-0 flex-col gap-pharo-2',
  label: 'text-pharo-sm font-medium text-pharo-foreground',
  options:
    'flex flex-wrap gap-pharo-1 rounded-pharo-control border border-pharo-control-border bg-pharo-surface p-pharo-1',
  option:
    'flex min-h-pharo-control min-w-0 flex-1 cursor-pointer items-center justify-center rounded-pharo-control border border-transparent px-pharo-3 py-pharo-2 text-center text-pharo-sm font-medium text-pharo-foreground pharo-transition-colors hover:bg-pharo-selected pressed:bg-pharo-selected focus-visible:pharo-focus-ring selected:pharo-selected-action disabled:cursor-not-allowed disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground',
};
