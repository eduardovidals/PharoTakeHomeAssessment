export const styles: Record<
  'overlay' | 'modal' | 'dialog' | 'header' | 'title' | 'close' | 'content',
  string
> = {
  overlay:
    'fixed inset-0 z-50 flex min-h-0 items-end justify-center bg-pharo-foreground/40 sm:items-center sm:p-pharo-dialog-inset',
  modal:
    'flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-pharo-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] font-pharo-body text-pharo-base text-pharo-foreground pharo-shadow-overlay sm:h-auto sm:max-h-[calc(100dvh-2*var(--spacing-pharo-dialog-inset))] sm:max-w-pharo-dialog sm:rounded-pharo-card',
  dialog: 'flex min-h-0 max-h-[inherit] flex-col overflow-hidden outline-none',
  header:
    'flex shrink-0 items-start justify-between gap-pharo-4 border-b border-pharo-border p-pharo-4',
  title: 'min-w-0 self-center text-pharo-lg font-semibold wrap-break-word',
  close: 'shrink-0',
  content: 'min-h-0 overflow-auto overscroll-contain p-pharo-4',
};
