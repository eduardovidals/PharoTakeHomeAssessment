import {
  Button,
  ComboBox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from 'react-aria-components';
import { assertFieldInputProps } from '../../fields/fieldInputProps';
import { mergeClasses } from '../../styles/mergeClasses';
import {
  controlStyles,
  descriptionStyles,
  emptyStyles,
  errorStyles,
  fieldStyles,
  inputStyles,
  labelStyles,
  listStyles,
  optionContentStyles,
  optionStyles,
  optionTextStyles,
  popoverStyles,
  triggerStyles,
} from './styles';
import type { PharoComboBoxProps as Props } from './types';

/**
 * Generic single-choice input with a portaled, keyboard-accessible option list.
 * Use defaultItems for built-in filtering or items for a consumer-controlled collection.
 * @example
 * ```tsx
 * const options = [{ id: 'alpha', label: 'Alpha' }];
 * <PharoComboBox
 *   label="Choose an option"
 *   defaultItems={options}
 *   itemKey={(item) => item.id}
 *   itemText={(item) => item.label}
 * />;
 * ```
 */
export function PharoComboBox<T extends object>(props: Props<T>) {
  const {
    label,
    itemKey,
    itemText,
    description,
    errorMessage,
    inputRef,
    inputProps,
    emptyMessage = 'No options found.',
    allowsEmptyCollection = true,
    className,
    ...rest
  } = props;
  assertFieldInputProps(inputProps);

  return (
    <ComboBox<T>
      {...rest}
      allowsEmptyCollection={allowsEmptyCollection}
      className={(state) =>
        mergeClasses(fieldStyles, typeof className === 'function' ? className(state) : className)
      }
    >
      <Label className={labelStyles}>{label}</Label>
      <div className={controlStyles}>
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
        <Button aria-label="Show options" className={triggerStyles}>
          <span aria-hidden="true">▾</span>
        </Button>
      </div>
      {description != null ? (
        <Text slot="description" className={descriptionStyles}>
          {description}
        </Text>
      ) : null}
      <FieldError className={errorStyles}>{errorMessage}</FieldError>
      <Popover className={popoverStyles}>
        <ListBox<T>
          className={listStyles}
          renderEmptyState={() => <div className={emptyStyles}>{emptyMessage}</div>}
        >
          {(item) => {
            const text = itemText(item);
            return (
              <ListBoxItem id={itemKey(item)} textValue={text} className={optionStyles}>
                {({ isSelected }) => (
                  <span className={optionContentStyles}>
                    <span className={optionTextStyles}>{text}</span>
                    <span aria-hidden="true">{isSelected ? '✓' : null}</span>
                  </span>
                )}
              </ListBoxItem>
            );
          }}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
