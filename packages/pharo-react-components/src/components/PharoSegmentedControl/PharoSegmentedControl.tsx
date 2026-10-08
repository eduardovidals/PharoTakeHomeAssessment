import { Label, Radio, RadioGroup } from 'react-aria-components';
import { mergeClasses } from '../../styles/mergeClasses';
import { segmentedStyles } from './styles';
import type { PharoSegmentedControlProps as Props } from './types';

/**
 * Present one controlled choice with native radio focus and arrow-key behavior.
 * @example
 * ```tsx
 * <PharoSegmentedControl label="Display" options={displayOptions}
 *   value={display} onChange={setDisplay} />
 * ```
 */
export function PharoSegmentedControl<Value extends string>(props: Props<Value>) {
  const { label, options, value, onChange, isDisabled, className } = props;

  const handleChange = (next: string) => {
    const option = options.find((candidate) => candidate.value === next);

    if (option && !option.isDisabled && !isDisabled) onChange(option.value);
  };

  return (
    <RadioGroup
      value={value}
      onChange={handleChange}
      isDisabled={isDisabled}
      orientation="horizontal"
      className={mergeClasses(segmentedStyles.group, className)}
    >
      <Label className={segmentedStyles.label}>{label}</Label>
      <div className={segmentedStyles.options}>
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            isDisabled={option.isDisabled}
            className={segmentedStyles.option}
          >
            {option.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
