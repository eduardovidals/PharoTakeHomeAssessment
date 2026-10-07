import type { ReactNode, Ref } from 'react';
import type { InputProps, TextFieldProps } from 'react-aria-components';
import type { managedInputKeys } from '../../fields/fieldInputProps';

/** Native input hints; the outer field owns values, events, state and associations. */
export type PharoTextFieldInputProps = Omit<InputProps, (typeof managedInputKeys)[number]> & {
  [Key in (typeof managedInputKeys)[number]]?: never;
};

/** A labeled text field usable directly or through a separate form adapter. */
export interface PharoTextFieldProps extends Omit<TextFieldProps, 'children'> {
  /** Visible accessible label. */
  label: ReactNode;
  /** Supporting text programmatically associated with the input. */
  description?: ReactNode;
  /** Validation message associated with an invalid field. */
  errorMessage?: ReactNode;
  /** Ref to the actual input, including form-library error focus. */
  inputRef?: Ref<HTMLInputElement>;
  /** Native hints and className customization; managed keys are rejected. */
  inputProps?: PharoTextFieldInputProps;
}
