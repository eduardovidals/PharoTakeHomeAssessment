import type { InputProps } from 'react-aria-components';

/** Field-owned keys must not compete with React Aria's input context. */
export const managedInputKeys = Object.freeze([
  'ref',
  'value',
  'defaultValue',
  'name',
  'onChange',
  'onBlur',
  'disabled',
  'readOnly',
  'required',
  'id',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-invalid',
  'aria-disabled',
  'aria-readonly',
  'aria-required',
  'aria-errormessage',
  'aria-controls',
  'aria-expanded',
  'aria-haspopup',
  'aria-activedescendant',
  'slot',
] satisfies readonly (keyof InputProps | 'ref')[]);

/** Reject untyped overrides as well as forbidden keys explicitly set to undefined. */
export function assertFieldInputProps(inputProps: object | undefined) {
  if (inputProps !== undefined && managedInputKeys.some((key) => Object.hasOwn(inputProps, key))) {
    throw new Error(
      'PHARO-FIELD-INPUT-PROPS: Configure managed values, events and associations on the field.',
    );
  }
}
