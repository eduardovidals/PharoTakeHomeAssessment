import { useImperativeHandle, useRef } from 'react';
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
import type { Key } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { PharoSpinner } from '../PharoSpinner';
import { PharoTagGroup } from '../PharoTagGroup';
import { PharoActiveOption } from './components/PharoActiveOption';
import { useSelectionActions } from './hooks/useSelectionActions';
import { styles } from './styles';
import { selectionActions, validateSelectionLimit } from './utils';
import type { PharoMultiComboBoxProps as Props } from './types';

/**
 * Select generic items while the consumer owns committed keys and transient text.
 * @example
 * ```tsx
 * <PharoMultiComboBox label="Plants" items={plants} itemKey={plantKey}
 *   itemText={plantText} selectedKeys={keys} selectedText={selectedText}
 *   inputValue={query} onInputChange={setQuery} onSelectionAction={selectPlant} />
 * ```
 */
export function PharoMultiComboBox<Item extends object>(props: Props<Item>) {
  const {
    label,
    items,
    itemKey,
    itemText,
    selectedKeys,
    selectedText,
    inputValue,
    onInputChange,
    onSelectionAction,
    maxSelected,
    description,
    errorMessage,
    emptyMessage = 'No options found.',
    loadingMessage = 'Loading options…',
    limitMessage = 'Selection limit reached. Remove an item to add another.',
    placeholder,
    isLoading,
    isReadOnly,
    isDisabled,
    isInvalid,
    inputRef,
    className,
    tagClassName,
    selectionActions: actions,
    renderItem,
  } = props;

  validateSelectionLimit(maxSelected);

  const fieldRef = useRef<HTMLInputElement>(null);
  useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
    inputRef,
    () => fieldRef.current,
  );

  const { changeInput, perform, failed, limited } = useSelectionActions({
    selectedKeys,
    inputValue,
    onInputChange,
    onSelectionAction,
    maxSelected,
    isDisabled,
    isReadOnly,
    inputRef: fieldRef,
  });
  const atLimit = maxSelected !== undefined && selectedKeys.length >= maxSelected;

  const handleSelection = (keys: Key[]) => {
    for (const action of selectionActions(selectedKeys, keys, items.map(itemKey)))
      void perform(action);
  };

  const handleRemove = (keys: readonly Key[]) => perform({ kind: 'remove', keys });

  return (
    <div className={mergeClasses(styles.root, className)}>
      <ComboBox<Item, 'multiple'>
        selectionMode="multiple"
        value={selectedKeys}
        onChange={handleSelection}
        items={items}
        inputValue={inputValue}
        onInputChange={changeInput}
        menuTrigger="focus"
        allowsEmptyCollection
        allowsCustomValue
        disabledKeys={
          atLimit ? items.map(itemKey).filter((key) => !selectedKeys.includes(key)) : []
        }
        isReadOnly={isReadOnly}
        isDisabled={isDisabled}
        isInvalid={isInvalid || failed}
        className={styles.field}
      >
        {({ isOpen }) => (
          <>
            <Label className={styles.label}>{label}</Label>
            <div className={styles.control}>
              <Input
                ref={fieldRef}
                placeholder={placeholder}
                aria-busy={Boolean(isLoading)}
                className={styles.input}
              />
              <Button aria-label="Show options" className={styles.trigger}>
                {isLoading ? (
                  <span aria-hidden="true" className={styles.spinner}>
                    <PharoSpinner size="sm" />
                  </span>
                ) : (
                  <span aria-hidden="true">▾</span>
                )}
              </Button>
            </div>
            <Text slot="description" className={styles.help}>
              {description != null ? <>{description} </> : null}
              {maxSelected !== undefined
                ? `${selectedKeys.length}/${maxSelected} selected`
                : `${selectedKeys.length} selected`}
              .{atLimit || limited ? <> {limitMessage}</> : null}
            </Text>
            <FieldError className={styles.error}>
              {errorMessage ?? (failed ? 'Selection could not be updated. Try again.' : undefined)}
            </FieldError>
            {!isOpen && (
              <span role="status" aria-live="polite" className={styles.announcement}>
                {isLoading ? loadingMessage : null}
              </span>
            )}
            <Popover className={styles.popover}>
              {isLoading && items.length > 0 && (
                <span role="status" aria-live="polite" className={styles.announcement}>
                  {loadingMessage}
                </span>
              )}
              <ListBox<Item>
                className={styles.list}
                dependencies={[itemKey, itemText, renderItem]}
                renderEmptyState={() =>
                  isLoading ? (
                    <div className={styles.loading}>
                      <span aria-hidden="true" className={styles.spinner}>
                        <PharoSpinner size="sm" />
                      </span>
                      <span role="status" aria-live="polite">
                        {loadingMessage}
                      </span>
                    </div>
                  ) : (
                    <div className={styles.empty}>{emptyMessage}</div>
                  )
                }
              >
                {(item) => (
                  <ListBoxItem
                    id={itemKey(item)}
                    textValue={itemText(item)}
                    className={styles.option}
                  >
                    {({ isSelected, isDisabled: isOptionDisabled }) => (
                      <span className={styles.content}>
                        <span className={styles.text}>
                          {renderItem ? renderItem(item) : itemText(item)}
                        </span>
                        <span aria-hidden="true" className={styles.state}>
                          {isOptionDisabled ? 'Limit reached' : isSelected ? '✓' : null}
                        </span>
                      </span>
                    )}
                  </ListBoxItem>
                )}
              </ListBox>
            </Popover>
            <PharoActiveOption query={inputValue} />
          </>
        )}
      </ComboBox>
      <div className={styles.selection}>
        <PharoTagGroup
          label="Selected items"
          items={selectedKeys.map((key) => ({
            id: key,
            text: selectedText(key),
            className: tagClassName?.(key),
          }))}
          onRemove={isReadOnly ? undefined : handleRemove}
          isDisabled={isDisabled}
        />
        {actions}
      </div>
    </div>
  );
}
