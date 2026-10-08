import { useEffect, useMemo, useRef, useState } from 'react';
import type { DateValue } from '@internationalized/date';
import { PharoButton, PharoIconButton } from '@pharo/react-components';
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  Label,
  Popover,
  Text,
} from 'react-aria-components';
import { toCalendarDate } from './utils';
import { navigationStyles as styles } from './styles';
import type { ComparisonDateNavigationProps as Props, UnavailableDateEntry } from './types';

/**
 * Pin a date without fetching, duplicating state, or changing the Latest default.
 * @example
 * ```tsx
 * <ComparisonDateNavigation selectedTimestamp={date} timeline={dates} onTimestampChange={setDate} />
 * ```
 */
export function ComparisonDateNavigation(props: Props) {
  const { selectedTimestamp, previewTimestamp = null, timeline, onTimestampChange } = props;

  const latestTimestamp = timeline.at(-1);
  const current = previewTimestamp ?? selectedTimestamp ?? latestTimestamp;
  const value = useMemo(() => {
    const timestamp = previewTimestamp ?? selectedTimestamp ?? latestTimestamp;
    return timestamp === undefined ? null : toCalendarDate(timestamp);
  }, [previewTimestamp, selectedTimestamp, latestTimestamp]);

  const pickerRef = useRef<HTMLDivElement>(null);
  const [unavailableEntry, setUnavailableEntry] = useState<UnavailableDateEntry>();
  const restoreDateFocus = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (selectedTimestamp === restoreDateFocus.current) {
      restoreDateFocus.current = undefined;
      pickerRef.current?.querySelector('button')?.focus();
    }
  }, [selectedTimestamp]);

  // Discard validation from an earlier pin when another control changes the date.
  if (
    unavailableEntry &&
    (unavailableEntry.selectedTimestamp !== selectedTimestamp ||
      unavailableEntry.latestTimestamp !== latestTimestamp ||
      timeline.includes(unavailableEntry.value.toDate('UTC').getTime()))
  ) {
    setUnavailableEntry(undefined);
  }

  const previous = timeline
    .filter((timestamp) => current !== undefined && timestamp < current)
    .at(-1);
  const next = timeline.find((timestamp) => current !== undefined && timestamp > current);

  // Retain an explicit selected date even if a newly selected instrument lacks that observation.
  const dates =
    selectedTimestamp !== null && !timeline.includes(selectedTimestamp)
      ? [...timeline, selectedTimestamp].sort((left, right) => left - right)
      : timeline;
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  const availableDates = new Set(dates);

  const isDateUnavailable = (date: DateValue) => !availableDates.has(date.toDate('UTC').getTime());

  const handleChange = (date: DateValue | null) => {
    if (date !== null && isDateUnavailable(date)) {
      setUnavailableEntry({ value: date, selectedTimestamp, latestTimestamp });
      return;
    }

    setUnavailableEntry(undefined);
    onTimestampChange(date === null ? null : date.toDate('UTC').getTime());
  };

  return (
    <div className={styles.group}>
      <DatePicker
        ref={pickerRef}
        className={styles.picker}
        value={previewTimestamp === null ? (unavailableEntry?.value ?? value) : value}
        onChange={handleChange}
        minValue={firstDate === undefined ? undefined : toCalendarDate(firstDate)}
        maxValue={lastDate === undefined ? undefined : toCalendarDate(lastDate)}
        placeholderValue={lastDate === undefined ? undefined : toCalendarDate(lastDate)}
        isDateUnavailable={isDateUnavailable}
        isDisabled={timeline.length === 0}
        isInvalid={previewTimestamp === null && unavailableEntry !== undefined}
        validationBehavior="aria"
        granularity="day"
      >
        <div className={styles.labelRow}>
          <Label className={styles.label}>Comparison date</Label>
          {(previewTimestamp !== null || selectedTimestamp === null) && (
            <span className={styles.latest}>
              {previewTimestamp === null ? 'Latest' : 'Preview'}
            </span>
          )}
        </div>
        <Group className={styles.field}>
          <DateInput className={styles.input}>
            {(segment) => <DateSegment segment={segment} className={styles.segment} />}
          </DateInput>
          <PharoIconButton
            aria-label="Choose comparison date"
            aria-labelledby=""
            variant="quiet"
            className={styles.trigger}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M7 3v4M17 3v4M3 11h18" />
              </svg>
            }
          />
        </Group>
        <Text slot="description" className={styles.description}>
          {previewTimestamp !== null
            ? 'Chart preview. Click the chart to pin this date.'
            : selectedTimestamp === null
              ? 'Latest available date. Statistics use each instrument’s full history.'
              : 'Pinned date. Statistics include observations through this date.'}
        </Text>
        <FieldError className={styles.error}>Choose a date with recorded observations.</FieldError>
        <Popover className={styles.popover} containerPadding={4}>
          <Dialog aria-label="Choose comparison date" className={styles.dialog}>
            <Calendar className={styles.calendar}>
              <header className={styles.calendarHeader}>
                <PharoIconButton slot="previous" aria-label="Previous month" icon="←" />
                <Heading className={styles.heading} />
                <PharoIconButton slot="next" aria-label="Next month" icon="→" />
              </header>
              <CalendarGrid className={styles.grid} weekdayStyle="short">
                {(date) => <CalendarCell date={date} className={styles.cell} />}
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </Popover>
      </DatePicker>
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
