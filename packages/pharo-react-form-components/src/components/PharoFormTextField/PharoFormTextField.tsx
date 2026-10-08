import { PharoTextField } from '@pharo/react-components';
import { Controller, useFormState } from 'react-hook-form';
import type { FieldPathByValue, FieldValues } from 'react-hook-form';
import { assertManagedFormProps, managedTextFieldKeys } from '../../fields/managedFormProps';
import { textValue } from '../../fields/stringValue';
import type { PharoFormTextFieldProps as Props } from './types';

/**
 * Accessible string field with one form-owned draft and schema validation.
 * Undefined displays empty until edited. Disabled fields are omitted from submission;
 * read-only fields remain focusable, validated and included.
 * @example
 * ```tsx
 * const form = useSchemaForm(z.object({ search: z.string() }), {
 *   defaultValues: { search: '' },
 * });
 *
 * <PharoFormTextField control={form.control} name="search" label="Search" />;
 * ```
 */
export function PharoFormTextField<
  Input extends FieldValues,
  Output extends FieldValues = Input,
  Context = unknown,
>(props: Props<Input, Output, Context>) {
  assertManagedFormProps(props, managedTextFieldKeys, 'PHARO-FORMS-TEXT-PROPS');

  const { control, name, isDisabled, ...rest } = props;
  const { disabled: formDisabled } = useFormState<Input, Output>({ control });

  return (
    <Controller<Input, FieldPathByValue<Input, string | undefined>, Output>
      control={control}
      name={name}
      disabled={Boolean(isDisabled || formDisabled)}
      render={({ field, fieldState }) => (
        <PharoTextField
          {...rest}
          name={field.name}
          value={textValue(field.value)}
          onChange={field.onChange}
          onBlur={field.onBlur}
          inputRef={field.ref}
          isDisabled={field.disabled ?? false}
          isInvalid={fieldState.invalid}
          errorMessage={fieldState.error?.message}
          validationBehavior="aria"
        />
      )}
    />
  );
}
