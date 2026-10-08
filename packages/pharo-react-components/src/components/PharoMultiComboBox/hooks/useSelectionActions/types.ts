import type { RefObject } from 'react';
import type { Key } from 'react-aria-components';
import type { PharoSelectionAction, PharoSelectionOutcome } from '../../types';

/** Lifecycle inputs; selection itself remains entirely controlled. */
export interface UseSelectionActionsOptions {
  /** Current committed selection, supplied by the owner. */
  readonly selectedKeys: readonly Key[];
  /** Current controlled draft, used to detect intervening input edits. */
  readonly inputValue: string;
  /** Consumer draft update callback. */
  readonly onInputChange: (value: string) => void;
  /** Consumer commit operation; the hook observes its outcome and rejection. */
  readonly onSelectionAction: (
    action: PharoSelectionAction,
  ) => PharoSelectionOutcome | Promise<PharoSelectionOutcome>;
  /** Actual input used to restore focus after the final committed removal. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** Optional cap checked before requesting an additional selection. */
  readonly maxSelected?: number;
  /** Suppress every mutation while disabled. */
  readonly isDisabled?: boolean;
  /** Preserve focusable values while suppressing mutation. */
  readonly isReadOnly?: boolean;
}
