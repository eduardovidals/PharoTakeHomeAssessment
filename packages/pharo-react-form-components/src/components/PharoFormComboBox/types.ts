import type { PharoComboBoxProps } from '@pharo/react-components';
import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';
import type { managedComboBoxKeys } from '../../fields/managedFormProps';

export type { PharoComboBoxInputProps } from '@pharo/react-components';

/** A single string selection binding over the public generic accessible combobox. */
export type PharoFormComboBoxProps<
  Input extends FieldValues,
  Item extends object,
  Output extends FieldValues = Input,
  Context = unknown,
> = Omit<PharoComboBoxProps<Item>, (typeof managedComboBoxKeys)[number] | 'name' | 'itemKey'> & {
  [Key in (typeof managedComboBoxKeys)[number]]?: never;
} & {
  /** String field path in schema input; the empty string represents no selection. */
  name: FieldPathByValue<Input, string | undefined>;
  /** Consumer-owned control with schema output and resolver context preserved. */
  control: Control<Input, Context, Output>;
  /** Stable unique nonempty string key; empty keys are reserved for clearing. */
  itemKey: (item: Item) => string;
};
