import { useId } from 'react';
import { styles } from './styles';
import type { PharoChartInspectionProps as Props } from './types';

/**
 * Display exact recorded values with a native keyboard date control and focus-revealed help.
 * @example
 * ```tsx
 * <PharoChartInspection label="Readings" timeline={dates} timestamp={date}
 *   date={formattedDate} valueText={spokenValues} details={details} onInspect={setDate} />
 * ```
 */
export function PharoChartInspection(props: Props) {
  const {
    label,
    timeline,
    timestamp,
    navigationTimestamp = timestamp,
    onNavigationFocus,
    date,
    valueText,
    details,
    onInspect,
  } = props;
  const id = useId();
  const instructionId = `${id}-instructions`;
  return (
    <div className={styles.root}>
      <section aria-label={`Details for ${label}`} className={styles.details}>
        <h3 className={styles.date}>
          <time dateTime={new Date(timestamp).toISOString()}>{date}</time>
        </h3>
        <dl className={styles.list}>
          {details.map((row) => (
            <div key={row.id} className={styles.item}>
              <dt className={styles.name}>{row.label}</dt>
              <dd className={styles.value}>{row.display}</dd>
            </div>
          ))}
        </dl>
      </section>
      {timeline.length > 1 ? (
        <div className={styles.control}>
          <label htmlFor={id} className={styles.label}>
            Inspect {label}
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={timeline.length - 1}
            step={1}
            value={timeline.indexOf(navigationTimestamp)}
            onFocus={onNavigationFocus}
            aria-valuetext={valueText}
            aria-describedby={instructionId}
            className={styles.range}
            onChange={(event) => {
              const index = Number(event.currentTarget.value);
              const next = Number.isInteger(index) ? timeline[index] : undefined;
              if (next !== undefined) onInspect(next);
            }}
          />
          <p id={instructionId} className={styles.help}>
            Use arrow keys, Home and End to inspect recorded dates. Tab moves to the next control.
          </p>
        </div>
      ) : null}
    </div>
  );
}
