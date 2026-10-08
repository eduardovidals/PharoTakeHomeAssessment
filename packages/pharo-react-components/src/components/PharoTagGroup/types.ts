import type { Key } from 'react-aria-components';

/** One controlled label, independent of any currently filtered option list. */
export interface PharoTagItem {
  /** Stable unique collection identity. */
  readonly id: Key;
  /** Visible and accessible text, including fallback labels for unknown values. */
  readonly text: string;
  /** Complete utility classes for consumer-owned visual identity. */
  readonly className?: string;
}

/** Accessible tags whose values remain owned by the consumer. */
export interface PharoTagGroupProps {
  /** Accessible name of this collection. */
  readonly label: string;
  /** Present values; filtering elsewhere must not remove them from this collection. */
  readonly items: readonly PharoTagItem[];
  /** Omit for non-removable tags. The consumer commits removal and owns failure feedback. */
  readonly onRemove?: (keys: readonly Key[]) => void | Promise<void>;
  /** Complete accessible name of a removal action; defaults to Remove followed by its text. */
  readonly removeLabel?: (item: PharoTagItem) => string;
  /** Suppress all tag mutations while retaining the labels. */
  readonly isDisabled?: boolean;
  /** Complete utility classes for the collection. */
  readonly className?: string;
}
