import { useEffect, useRef } from 'react';
import { PharoButton } from '@pharo/react-components';
import { Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { formatDateTable } from '../../../../../../../../utils/date';
import { navigationStyles as styles } from './styles';
import type { ComparisonDateNavigationProps as Props } from './types';

/**
 * Pin a date without fetching, duplicating state, or changing the Latest default.
 * @example
 * ```tsx
 * <ComparisonDateNavigation selectedTimestamp={date} timeline={dates} onTimestampChange={setDate} />
 * ```
 */
export function ComparisonDateNavigation(props: Props) {
  const { selectedTimestamp, timeline, onTimestampChange } = props;
  const selectRef = useRef<HTMLDivElement>(null);
  const restoreDateFocus = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (selectedTimestamp === restoreDateFocus.current) {
      restoreDateFocus.current = undefined;
      selectRef.current?.querySelector('button')?.focus();
    }
  }, [selectedTimestamp]);
  const current = selectedTimestamp ?? timeline.at(-1);
  const previous = timeline
    .filter((timestamp) => current !== undefined && timestamp < current)
    .at(-1);
  const next = timeline.find((timestamp) => current !== undefined && timestamp > current);
  // Retain an explicit selected date even if a newly selected instrument lacks that observation.
  const dates =
    selectedTimestamp !== null && !timeline.includes(selectedTimestamp)
      ? [...timeline, selectedTimestamp].sort((left, right) => left - right)
      : timeline;
  const options = [
    { id: 'latest', label: 'Latest' },
    ...dates.map((timestamp) => ({
      id: String(timestamp),
      label: formatDateTable(timestamp),
    })),
  ];
  const handleChange = (key: string | number | null) => {
    if (key === 'latest') onTimestampChange(null);
    else if (key !== null) onTimestampChange(Number(key));
  };
  return (
    <div className={styles.group}>
      <Select
        ref={selectRef}
        className={styles.select}
        value={selectedTimestamp === null ? 'latest' : String(selectedTimestamp)}
        onChange={handleChange}
      >
        <Label className={styles.label}>Comparison date</Label>
        <PharoButton variant="secondary" size="sm" className={styles.trigger}>
          <SelectValue />
          <span aria-hidden="true">⌄</span>
        </PharoButton>
        <Popover className={styles.popover}>
          <ListBox items={options} className={styles.list}>
            {(item) => (
              <ListBoxItem id={item.id} textValue={item.label} className={styles.option}>
                {item.label}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </Select>
      <PharoButton
        variant="secondary"
        size="sm"
        aria-label="Previous date"
        className={styles.arrow}
        isDisabled={previous === undefined}
        onPress={() => {
          if (previous !== undefined) {
            if (previous === timeline[0]) restoreDateFocus.current = previous;
            onTimestampChange(previous);
          }
        }}
      >
        <span aria-hidden="true">←</span>
      </PharoButton>
      <PharoButton
        variant="secondary"
        size="sm"
        aria-label="Next date"
        className={styles.arrow}
        isDisabled={next === undefined}
        onPress={() => {
          if (next !== undefined) {
            if (next === timeline.at(-1)) restoreDateFocus.current = next;
            onTimestampChange(next);
          }
        }}
      >
        <span aria-hidden="true">→</span>
      </PharoButton>
      {selectedTimestamp !== null && (
        <PharoButton
          variant="secondary"
          size="sm"
          className={styles.back}
          onPress={() => {
            restoreDateFocus.current = null;
            onTimestampChange(null);
          }}
        >
          Back to latest
        </PharoButton>
      )}
    </div>
  );
}
