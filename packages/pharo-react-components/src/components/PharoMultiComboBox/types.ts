import type { ReactNode, Ref } from 'react';
import type { Key } from 'react-aria-components';

/** Intent evaluated against the consumer's current authoritative selection. */
export type PharoSelectionAction =
  | {
      /** Add one eligible item without replacing the current selection. */
      readonly kind: 'add';
      /** Stable key of the item to add. */
      readonly key: Key;
    }
  | {
      /** Remove only the named values, preserving other choices. */
      readonly kind: 'remove';
      /** Keys requested for removal. */
      readonly keys: readonly Key[];
    }
  | {
      /** Clear the consumer's committed selection. */
      readonly kind: 'clear';
    };

/** Only a committed addition clears its unchanged transient draft. */
export type PharoSelectionOutcome = 'committed' | 'unchanged' | 'limit';

/** Accessible multiple selection with consumer-owned items, keys and draft text. */
export interface PharoMultiComboBoxProps<Item extends object> {
  /** Visible accessible label for the editable picker. */
  readonly label: ReactNode;
  /** Available results, already filtered and ordered by the consumer. */
  readonly items: readonly Item[];
  /** Stable unique collection key for each item. */
  readonly itemKey: (item: Item) => Key;
  /** Complete accessible option text, including when renderItem customizes its appearance. */
  readonly itemText: (item: Item) => string;
  /** Ordered committed values; keys missing from the current results remain selected. */
  readonly selectedKeys: readonly Key[];
  /** Resolves selected labels even when their keys are absent from filtered items. */
  readonly selectedText: (key: Key) => string;
  /** Temporary input text, distinct from committed keys. */
  readonly inputValue: string;
  /** Updates the controlled draft on edits and after a successful addition. */
  readonly onInputChange: (value: string) => void;
  /** Commits an intent against current consumer state; rejected promises retain the draft. */
  readonly onSelectionAction: (
    action: PharoSelectionAction,
  ) => PharoSelectionOutcome | Promise<PharoSelectionOutcome>;
  /** Positive integer; omit for no selection cap. */
  readonly maxSelected?: number;
  /** Supporting text associated with the input alongside its selection count. */
  readonly description?: ReactNode;
  /** Safe validation or recovery text; do not pass raw server errors. */
  readonly errorMessage?: ReactNode;
  /** Message for a collection without available results. */
  readonly emptyMessage?: ReactNode;
  /** Visible message while the collection is loading. */
  readonly loadingMessage?: ReactNode;
  /** Guidance shown when additional selections are unavailable at the configured cap. */
  readonly limitMessage?: ReactNode;
  /** Input hint; the visible label remains the accessible name. */
  readonly placeholder?: string;
  /** Mark collection loading without discarding existing results or selected tags. */
  readonly isLoading?: boolean;
  /** Keep values focusable and readable while suppressing edits and removal. */
  readonly isReadOnly?: boolean;
  /** Disable all control interactions while preserving visible values. */
  readonly isDisabled?: boolean;
  /** Associate the validation message with an invalid field. */
  readonly isInvalid?: boolean;
  /** Ref to the actual editable input. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Complete utility classes merged onto the outer control. */
  readonly className?: string;
  /** Complete tag classes for consumer-owned categorical appearance. */
  readonly tagClassName?: (key: Key) => string;
  /** Consumer-owned supporting actions beside the selected tags, wrapping on small screens. */
  readonly selectionActions?: ReactNode;
  /** Optional visual option content; itemText still supplies the accessible text. */
  readonly renderItem?: (item: Item) => ReactNode;
}
