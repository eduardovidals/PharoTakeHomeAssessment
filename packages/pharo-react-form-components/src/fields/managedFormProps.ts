import type { PharoComboBoxProps, PharoTextFieldProps } from '@pharo/react-components';

/** The text binding owns these values, events and validation controls. */
export const managedTextFieldKeys = Object.freeze([
  'ref',
  'value',
  'defaultValue',
  'onChange',
  'onBlur',
  'inputRef',
  'isInvalid',
  'errorMessage',
  'validate',
  'validationBehavior',
] satisfies readonly (keyof PharoTextFieldProps | 'ref')[]);

/** The selection binding owns both current and legacy React Aria value APIs. */
export const managedComboBoxKeys = Object.freeze([
  'ref',
  'value',
  'defaultValue',
  'onChange',
  'selectedKey',
  'defaultSelectedKey',
  'onSelectionChange',
  'inputValue',
  'defaultInputValue',
  'onInputChange',
  'onBlur',
  'inputRef',
  'isInvalid',
  'errorMessage',
  'validate',
  'validationBehavior',
  'allowsCustomValue',
  'formValue',
  'selectionMode',
] satisfies readonly (keyof PharoComboBoxProps<object> | 'ref')[]);

/** Reject competing own keys from wider objects and untyped callers, even when undefined. */
export function assertManagedFormProps(props: object, keys: readonly string[], identifier: string) {
  if (keys.some((key) => Object.hasOwn(props, key))) {
    throw new Error(`${identifier}: Configure managed values and validation through the form.`);
  }
}
