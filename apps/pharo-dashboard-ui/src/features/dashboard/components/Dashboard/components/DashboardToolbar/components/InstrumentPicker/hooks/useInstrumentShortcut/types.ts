import type { RefObject } from 'react';

/** Instance-owned picker focus target for an optional keyboard shortcut. */
export interface InstrumentShortcutOptions {
  /** Actual editable input; never a second widget or selection owner. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
}
