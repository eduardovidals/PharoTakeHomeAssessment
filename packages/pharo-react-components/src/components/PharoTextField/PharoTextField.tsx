import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';
import { assertFieldInputProps } from '../../fields/fieldInputProps';
import { mergeClasses } from '../../styles/mergeClasses';
import { descriptionStyles, errorStyles, fieldStyles, inputStyles, labelStyles } from './styles';
import type { PharoTextFieldProps as Props } from './types';

/**
 * Labeled text input with associated help/errors and a ref to its actual input.
 * Configure controlled values, events and field state on the outer component.
 * @example
 * ```tsx
 * <PharoTextField label="Search" inputProps={{ placeholder: 'Type to search' }} />
 * ```
 */
export function PharoTextField(props: Props) {
  const { label, description, errorMessage, inputRef, inputProps, className, ...rest } = props;

  assertFieldInputProps(inputProps);

  return (
    <TextField
      {...rest}
      className={(state) =>
        mergeClasses(fieldStyles, typeof className === 'function' ? className(state) : className)
      }
    >
      <Label className={labelStyles}>{label}</Label>
      <Input
        {...inputProps}
        ref={inputRef}
        className={(state) =>
          mergeClasses(
            inputStyles,
            typeof inputProps?.className === 'function'
              ? inputProps.className(state)
              : inputProps?.className,
          )
        }
      />
      {description != null ? (
        <Text slot="description" className={descriptionStyles}>
          {description}
        </Text>
      ) : null}
      <FieldError className={errorStyles}>{errorMessage}</FieldError>
    </TextField>
  );
}
