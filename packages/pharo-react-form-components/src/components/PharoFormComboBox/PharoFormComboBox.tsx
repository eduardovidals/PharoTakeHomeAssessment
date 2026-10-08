import { PharoComboBox } from '@pharo/react-components';
import type { PharoComboBoxInputProps } from '@pharo/react-components';
import { Controller, useFormState } from 'react-hook-form';
import type { FieldPathByValue, FieldValues } from 'react-hook-form';
import { assertManagedFormProps, managedComboBoxKeys } from '../../fields/managedFormProps';
import { itemKeyValue, selectionKey, selectionValue } from '../../fields/stringValue';
import type { PharoFormComboBoxProps as Props } from './types';

/**
 * Bind a string selection while React Aria retains ownership of filtering text.
 * Filtering alone does not commit a value. Explicit clearing writes an empty string,
 * so item keys must be nonempty strings. Read-only values remain in submission.
 * @example
 * ```tsx
 * const choices = [{ id: 'alpha', label: 'Alpha' }];
 *
 * const form = useSchemaForm(z.object({ choice: z.string() }), {
 *   defaultValues: { choice: '' },
 * });
 *
 * <PharoFormComboBox
 *   control={form.control}
 *   name="choice"
 *   label="Choose an option"
 *   defaultItems={choices}
 *   itemKey={(item) => item.id}
 *   itemText={(item) => item.label}
 * />;
 * ```
 */
export function PharoFormComboBox<
  Input extends FieldValues,
  Item extends object,
  Output extends FieldValues = Input,
  Context = unknown,
>(props: Props<Input, Item, Output, Context>) {
  assertManagedFormProps(props, managedComboBoxKeys, 'PHARO-FORMS-COMBO-PROPS');

  const { control, name, itemKey, inputProps, isDisabled, isReadOnly, ...rest } = props;
  const { disabled: formDisabled } = useFormState<Input, Output>({ control });

  return (
    <Controller<Input, FieldPathByValue<Input, string | undefined>, Output>
      control={control}
      name={name}
      disabled={Boolean(isDisabled || formDisabled)}
      render={({ field, fieldState }) => {
        const onInput: NonNullable<PharoComboBoxInputProps['onInput']> = (event) => {
          // Native input identifies a deliberate clear; RAC blur/Escape resets do not.
          if (!field.disabled && !isReadOnly && event.currentTarget.value === '') {
            field.onChange('');
          }

          inputProps?.onInput?.(event);
        };

        // Retain every own key for the base guard, including non-enumerable conflicts.
        // A fresh object also supports frozen consumer hints without mutating them.
        const composedInputProps = Object.defineProperties(
          { onInput },
          {
            ...Object.getOwnPropertyDescriptors(inputProps ?? {}),
            onInput: { value: onInput, enumerable: true, configurable: true, writable: true },
          },
        );

        return (
          <PharoComboBox<Item>
            {...rest}
            name={field.name}
            itemKey={(item) => itemKeyValue(itemKey(item))}
            selectedKey={selectionKey(field.value)}
            onSelectionChange={(key) => field.onChange(selectionValue(key))}
            onBlur={field.onBlur}
            inputRef={field.ref}
            inputProps={composedInputProps}
            isDisabled={field.disabled ?? false}
            isReadOnly={isReadOnly}
            isInvalid={fieldState.invalid}
            errorMessage={fieldState.error?.message}
            validationBehavior="aria"
            allowsCustomValue={false}
            formValue="key"
          />
        );
      }}
    />
  );
}
