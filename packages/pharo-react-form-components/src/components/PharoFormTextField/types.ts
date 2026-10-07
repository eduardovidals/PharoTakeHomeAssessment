import type { PharoTextFieldProps } from '@pharo/react-components';
import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';
import type { managedTextFieldKeys } from '../../fields/managedFormProps';

export type { PharoTextFieldInputProps } from '@pharo/react-components';

/**
 * Bind a required, optional or nested string input to its form-owned value.
 * Output and Context preserve the supplied schema's transforms and resolver context.
 */
export type PharoFormTextFieldProps<
  Input extends FieldValues,
  Output extends FieldValues = Input,
  Context = unknown,
> = Omit<PharoTextFieldProps, (typeof managedTextFieldKeys)[number] | 'name'> & {
  [Key in (typeof managedTextFieldKeys)[number]]?: never;
} & {
  /** String field path in the schema input, including optional and nested strings. */
  name: FieldPathByValue<Input, string | undefined>;
  /** Consumer-owned form control; the binding does not create another form. */
  control: Control<Input, Context, Output>;
};
