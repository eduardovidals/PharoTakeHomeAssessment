import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import type { Key } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { segmentedStyles } from './styles';
import type { PharoSegmentedControlProps as Props } from './types';

/**
 * Present one controlled choice with radio semantics and roving button focus.
 * @example
 * ```tsx
 * <PharoSegmentedControl label="Display" options={displayOptions}
 *   value={display} onChange={setDisplay} />
 * ```
 */
export function PharoSegmentedControl<Value extends string>(props: Props<Value>) {
  const { label, options, value, onChange, isDisabled, className } = props;

  const handleSelectionChange = (keys: Set<Key>) => {
    const next = [...keys][0];
    const option = options.find((candidate) => candidate.value === next);

    if (option && !option.isDisabled && !isDisabled && option.value !== value)
      onChange(option.value);
  };

  return (
    <div className={mergeClasses(segmentedStyles.group, className)}>
      <span className={segmentedStyles.label}>{label}</span>
      <ToggleButtonGroup
        aria-label={label}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value]}
        onSelectionChange={handleSelectionChange}
        isDisabled={isDisabled}
        orientation="horizontal"
        className={segmentedStyles.options}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            id={option.value}
            isDisabled={option.isDisabled}
            className={segmentedStyles.option}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
