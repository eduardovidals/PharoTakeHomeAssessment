import { mergeClasses } from '../../styles/mergeClasses';
import {
  createInspectionTimeline,
  formatDate,
  formatNumber,
  inspectTimestamp,
  prepareChartRecords,
} from '../../utils/chartData';
import { styles } from './styles';
import type { PharoChartDataTableProps as Props } from './types';

/**
 * Present every recorded date and selected series without creating a second data owner.
 * @example
 * ```tsx
 * <PharoChartDataTable series={recordedSeries} caption="Recorded measurements" />
 * ```
 */
export function PharoChartDataTable(props: Props) {
  const {
    series,
    caption,
    formatXTable = formatDate,
    formatXAccessible,
    formatYTable = formatNumber,
    emptyMessage = 'No recorded observations.',
    className,
  } = props;
  const records = prepareChartRecords(series);

  if (records.kind === 'invalid')
    return (
      <p role="status" className={styles.status}>
        {records.message}
      </p>
    );

  const timeline = createInspectionTimeline(records.series);

  return (
    <div
      role="region"
      aria-label={caption}
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- Keyboard users can focus this named region to scroll every date and selected column.
      tabIndex={0}
      className={mergeClasses(styles.region, className)}
    >
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.dateHeader}>
              Date (UTC)
            </th>
            {records.series.map((item) => (
              <th key={item.id} scope="col" className={styles.header}>
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeline.map((timestamp) => (
            <tr key={timestamp}>
              <th
                scope="row"
                className={styles.date}
                aria-label={formatXAccessible?.(timestamp) || undefined}
              >
                <time dateTime={new Date(timestamp).toISOString()}>{formatXTable(timestamp)}</time>
              </th>
              {inspectTimestamp(records.series, timestamp).map((row) => (
                <td key={row.id} className={styles.cell}>
                  {row.kind === 'available' ? formatYTable(row.value) : 'Unavailable'}
                </td>
              ))}
            </tr>
          ))}
          {timeline.length === 0 ? (
            <tr>
              <td colSpan={records.series.length + 1} className={styles.status}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
