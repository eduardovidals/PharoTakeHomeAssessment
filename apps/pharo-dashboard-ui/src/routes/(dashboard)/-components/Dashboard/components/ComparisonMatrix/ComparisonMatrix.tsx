import { useId, useMemo, useRef, useState } from 'react';
import { PharoButton } from '@pharo/react-components';
import { formatDateTable } from '../../../../../../utils/date';
import { ComparisonDateNavigation } from './components/ComparisonDateNavigation';
import { useComparisonOverflow } from './hooks/useComparisonOverflow';
import { appearanceStyles, matrixStyles, valueStyles } from './styles';
import {
  getComparisonAnnouncement,
  getComparisonPeriods,
  getComparisonRows,
  getResourceFeedback,
} from './utils';
import type { ComparisonMatrixProps as Props, ComparisonQuery, ComparisonResource } from './types';

/**
 * Compare complete raw histories and API statistics in one stable semantic table.
 * @example
 * ```tsx
 * <ComparisonMatrix columns={selectedResources} onRemove={handleRemove} />
 * ```
 */
export function ComparisonMatrix(props: Props) {
  const { columns, onRemove, selectedTimestamp = null, timeline = [], onTimestampChange } = props;

  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { scrollRef, tableRef, isOverflowing } = useComparisonOverflow();
  const [retrying, setRetrying] = useState<readonly string[]>([]);
  const [removing, setRemoving] = useState<readonly string[]>([]);
  const [actionFailure, setActionFailure] = useState<string | null>(null);

  const rows = useMemo(
    () => getComparisonRows(columns, selectedTimestamp),
    [columns, selectedTimestamp],
  );
  const periods = useMemo(
    () => getComparisonPeriods(columns, selectedTimestamp),
    [columns, selectedTimestamp],
  );

  const feedback = columns.map((column) => ({
    ticker: column.ticker,
    prices: getResourceFeedback(
      column.prices,
      'prices',
      retrying.includes(`${column.ticker}:prices`),
    ),
    statistics:
      selectedTimestamp === null
        ? getResourceFeedback(
            column.statistics,
            'statistics',
            retrying.includes(`${column.ticker}:statistics`),
          )
        : { canRetry: false, notFound: false },
  }));
  const hasFeedback = feedback.some(
    ({ prices, statistics }) =>
      prices.message ||
      statistics.message ||
      prices.notFound ||
      statistics.notFound ||
      prices.canRetry ||
      statistics.canRetry,
  );

  const handleRetry = async (
    ticker: string,
    resource: ComparisonResource,
    query: ComparisonQuery,
    button: Element,
  ) => {
    const key = `${ticker}:${resource}`;
    if (retrying.includes(key)) return;

    setRetrying((keys) => [...keys, key]);
    setActionFailure(null);

    try {
      const result = await query.refetch();
      if (
        !getResourceFeedback(result, resource).canRetry &&
        button.isConnected &&
        button.ownerDocument.activeElement === button
      )
        headingRef.current?.focus();
    } catch {
      setActionFailure('Unable to retry this resource. Please try again.');
    } finally {
      setRetrying((keys) => keys.filter((candidate) => candidate !== key));
    }
  };

  const handleRemove = async (ticker: string) => {
    if (removing.includes(ticker)) return;

    setRemoving((keys) => [...keys, ticker]);
    setActionFailure(null);

    try {
      await onRemove(ticker);
    } catch {
      setActionFailure('Unable to remove this instrument. Please try again.');
    } finally {
      setRemoving((keys) => keys.filter((candidate) => candidate !== ticker));
    }
  };

  return (
    <section className={matrixStyles.panel} aria-labelledby={`${id}-heading`}>
      <h2 ref={headingRef} id={`${id}-heading`} tabIndex={-1} className={matrixStyles.heading}>
        Comparison
      </h2>
      {onTimestampChange && (
        <ComparisonDateNavigation
          selectedTimestamp={selectedTimestamp}
          timeline={timeline}
          onTimestampChange={onTimestampChange}
        />
      )}
      <p id={`${id}-description`} className={matrixStyles.description}>
        {selectedTimestamp === null
          ? 'Metrics cover each instrument’s full supplied window.'
          : `Pinned ${formatDateTable(selectedTimestamp)} · Statistics from the first available observation through this date, inclusive.`}
      </p>
      <div id={`${id}-periods`} className={matrixStyles.periods}>
        {periods.map(({ ticker, text }) => (
          <p key={ticker ?? 'shared'}>
            {ticker ? `${ticker}: ` : ''}
            {text}
          </p>
        ))}
      </div>
      <p role="status" className={matrixStyles.announcement}>
        {actionFailure ?? getComparisonAnnouncement(columns, selectedTimestamp)}
      </p>
      {actionFailure && <p className={matrixStyles.error}>{actionFailure}</p>}
      {isOverflowing && (
        <p id={`${id}-scroll-hint`} className={matrixStyles.scrollHint}>
          <span aria-hidden="true">↔ </span>
          {columns.length} {columns.length === 1 ? 'instrument' : 'instruments'} · Swipe or scroll
          to compare.
        </p>
      )}
      <div
        ref={scrollRef}
        className={matrixStyles.scroll}
        role="region"
        aria-label="Comparison table scroll area"
        aria-describedby={isOverflowing ? `${id}-scroll-hint` : undefined}
        // Keyboard users can scroll all selected columns without moving the document horizontally.
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
        tabIndex={0}
      >
        <table
          ref={tableRef}
          className={matrixStyles.table}
          aria-labelledby={`${id}-heading`}
          aria-describedby={
            selectedTimestamp === null ? `${id}-description` : `${id}-description ${id}-periods`
          }
        >
          <thead>
            <tr>
              <th scope="col" className={matrixStyles.rowHeader}>
                Metric
              </th>
              {columns.map(({ ticker, appearance = 'primary' }) => (
                <th key={ticker} scope="col" className={matrixStyles.columnHeader}>
                  <span className={matrixStyles.identity}>
                    <svg
                      viewBox="0 0 24 12"
                      aria-hidden="true"
                      className={appearanceStyles[appearance]}
                    >
                      <path d="M0 6H24" strokeWidth={2} />
                    </svg>
                    <span className={matrixStyles.ticker}>{ticker}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, values }) => (
              <tr key={label}>
                <th scope="row" className={matrixStyles.rowHeader}>
                  {label}
                </th>
                {values.map((value, index) => (
                  <td
                    key={columns[index]?.ticker}
                    className={`${matrixStyles.value} ${valueStyles[value.tone]}`}
                  >
                    {value.text}
                  </td>
                ))}
              </tr>
            ))}
            {hasFeedback && (
              <tr>
                <th scope="row" className={matrixStyles.rowHeader}>
                  Resources
                </th>
                {columns.map((column, index) => {
                  const state = feedback[index];
                  const notFound = state?.prices.notFound || state?.statistics.notFound;

                  return (
                    <td key={column.ticker} className={matrixStyles.statusCell}>
                      <div
                        role="group"
                        aria-label={`${column.ticker} resources`}
                        className={matrixStyles.feedback}
                      >
                        {notFound && (
                          <>
                            <p>Not in this dataset</p>
                            <PharoButton
                              variant="secondary"
                              size="sm"
                              className={matrixStyles.action}
                              isPending={removing.includes(column.ticker)}
                              onPress={() => void handleRemove(column.ticker)}
                            >
                              Remove {column.ticker} from comparison
                            </PharoButton>
                          </>
                        )}
                        {(['prices', 'statistics'] as const).map((resource) => {
                          const current = state?.[resource];
                          const key = `${column.ticker}:${resource}`;

                          return (
                            <div key={resource} className={matrixStyles.feedback}>
                              {current?.message && <p>{current.message}</p>}
                              {current?.canRetry && (
                                <PharoButton
                                  variant="secondary"
                                  size="sm"
                                  className={matrixStyles.action}
                                  isPending={retrying.includes(key) || column[resource].isFetching}
                                  onPress={(event) =>
                                    void handleRetry(
                                      column.ticker,
                                      resource,
                                      column[resource],
                                      event.target,
                                    )
                                  }
                                >
                                  {retrying.includes(key) || column[resource].isFetching
                                    ? 'Retrying'
                                    : 'Retry'}{' '}
                                  {column.ticker} {resource}
                                </PharoButton>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <details className={matrixStyles.help}>
        <summary>About these metrics</summary>
        <p>
          Total return: first to last observation. Daily volatility: sample deviation of daily
          returns. Max drawdown: largest peak-to-trough decline. Prices use the dataset’s supplied
          units.
        </p>
      </details>
    </section>
  );
}
