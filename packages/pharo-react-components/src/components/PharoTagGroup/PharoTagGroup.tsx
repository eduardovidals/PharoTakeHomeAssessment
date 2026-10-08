import { useId } from 'react';
import { Button, Tag, TagGroup, TagList } from 'react-aria-components';
import type { Key } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { tagStyles } from './styles';
import type { PharoTagGroupProps as Props } from './types';

/**
 * Keep controlled labels readable and removable through React Aria's tag interaction.
 * @example
 * ```tsx
 * <PharoTagGroup label="Selected categories" items={selectedCategories}
 *   onRemove={removeCategories} />
 * ```
 */
export function PharoTagGroup(props: Props) {
  const { label, items, onRemove, removeLabel, isDisabled, className } = props;
  const groupId = useId();
  const handleRemove = async (keys: Set<Key>) => {
    if (isDisabled || !onRemove) return;
    try {
      await onRemove([...keys]);
    } catch {
      // Controlled values remain present. The consumer owns recovery feedback.
    }
  };

  return (
    <TagGroup
      aria-label={label}
      onRemove={onRemove && !isDisabled ? handleRemove : undefined}
      disabledKeys={isDisabled ? items.map((item) => item.id) : undefined}
      className={mergeClasses(tagStyles.group, className)}
    >
      <TagList
        items={items}
        dependencies={[onRemove, removeLabel, isDisabled]}
        className={tagStyles.list}
      >
        {(item) => {
          const removeId = `${groupId}-remove-${typeof item.id}-${encodeURIComponent(String(item.id))}`;
          return (
            <Tag
              id={item.id}
              textValue={item.text}
              isDisabled={isDisabled}
              className={mergeClasses(tagStyles.tag, item.className)}
            >
              <span className={tagStyles.text}>{item.text}</span>
              {onRemove ? (
                <Button
                  id={removeId}
                  slot="remove"
                  aria-label={removeLabel?.(item) ?? `Remove ${item.text}`}
                  aria-labelledby={removeId}
                  isDisabled={isDisabled}
                  className={tagStyles.remove}
                >
                  <span aria-hidden="true" className={tagStyles.symbol}>
                    ×
                  </span>
                </Button>
              ) : null}
            </Tag>
          );
        }}
      </TagList>
    </TagGroup>
  );
}
