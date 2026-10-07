import type { ReactNode, Ref } from 'react';
import type { ComboBoxProps, InputProps, Key } from 'react-aria-components';
import type { managedInputKeys } from '../../fields/fieldInputProps';

/** Native input hints; React Aria's outer combobox owns selection and input state. */
export type PharoComboBoxInputProps = Omit<InputProps, (typeof managedInputKeys)[number]> & {
  [Key in (typeof managedInputKeys)[number]]?: never;
};

/** Generic single-choice combobox; collection data remains consumer-owned. */
export interface PharoComboBoxProps<T extends object> extends Omit<ComboBoxProps<T>, 'children'> {
  /** Visible accessible label. */
  label: ReactNode;
  /** Returns a stable unique key for each item. */
  itemKey: (item: T) => Key;
  /** Returns the visible and searchable text for each item. */
  itemText: (item: T) => string;
  /** Supporting text associated with the input. */
  description?: ReactNode;
  /** Validation message associated with an invalid field. */
  errorMessage?: ReactNode;
  /** Empty collection content; defaults to "No options found." */
  emptyMessage?: ReactNode;
  /** Ref to the actual editable input. */
  inputRef?: Ref<HTMLInputElement>;
  /** Native hints and className customization; managed keys are rejected. */
  inputProps?: PharoComboBoxInputProps;
}
