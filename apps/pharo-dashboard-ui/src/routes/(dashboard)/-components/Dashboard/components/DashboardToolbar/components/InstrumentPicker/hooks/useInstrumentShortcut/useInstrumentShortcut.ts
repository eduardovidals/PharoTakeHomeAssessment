import { useEffect } from 'react';
import type { InstrumentShortcutOptions } from './types';

/** Focus on / only when typing, native composition and modal interactions do not own the key. */
export function useInstrumentShortcut(options: InstrumentShortcutOptions): void {
  const { inputRef } = options;

  useEffect(() => {
    const document = inputRef.current?.ownerDocument;
    if (!document) return;

    const handleKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== '/' ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;

      if (document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]')) return;

      const input = inputRef.current;
      if (!input || input.disabled || input.readOnly) return;

      event.preventDefault();
      input.focus();
    };

    document.addEventListener('keydown', handleKey);

    return () => document.removeEventListener('keydown', handleKey);
  }, [inputRef]);
}
