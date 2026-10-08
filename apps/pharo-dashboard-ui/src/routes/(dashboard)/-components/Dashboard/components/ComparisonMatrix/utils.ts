import { getHistoricalComparison } from './calculations/utils';
import { formatDateRange, formatDateTable, toUtcTimestamp } from '../../../../../../utils/date';
import {
  formatPercentage,
  formatPrice,
  formatSignedPercentage,
} from '../../../../../../utils/number';
import type {
  ComparisonColumn,
  ComparisonPeriod,
  ComparisonQuery,
  ComparisonResource,
  ComparisonRow,
  ComparisonValue,
  ResourceFeedback,
} from './types';

/** Preserve independent resource outcomes while reducing repeated failure cards. */
export function getResourceFeedback(
  query: ComparisonQuery,
  resource: ComparisonResource,
  retrying = false,
): ResourceFeedback {
  const error = query.isError ? query.error : undefined;
  const canRetry =
    error?.kind === 'network' ||
    error?.kind === 'timeout' ||
    (error?.kind === 'http' && error.status !== undefined && error.status >= 500);
  if (retrying) return { canRetry: true, notFound: false };
  if (query.isFetching)
    return {
      message: `${query.data === undefined ? 'Loading' : 'Refreshing'} ${resource}…`,
      canRetry,
      notFound: false,
    };
  if (error?.kind === 'not-found') return { canRetry: false, notFound: true };
  if (error && error.kind !== 'cancelled')
    return {
      message: `${resource === 'prices' ? 'Prices' : 'Statistics'}: ${error.message}`,
      canRetry,
      notFound: false,
    };
  if (resource === 'prices' && Array.isArray(query.data) && query.data.length === 0)
    return { message: 'No recorded prices.', canRetry: false, notFound: false };
  return { canRetry: false, notFound: false };
}

/** Latest retains API metrics; pinned values come only from each cached history prefix. */
export function getComparisonRows(
  columns: readonly ComparisonColumn[],
  selectedTimestamp: number | null = null,
): readonly ComparisonRow[] {
  const snapshots = columns.map(({ prices }) =>
    selectedTimestamp === null
      ? undefined
      : getHistoricalComparison(prices.data ?? [], selectedTimestamp),
  );
  const metricSources = columns.map(({ prices, statistics }, index) =>
    selectedTimestamp === null
      ? { data: statistics.data, isPending: statistics.isPending }
      : { data: snapshots[index]?.statistics, isPending: prices.isPending },
  );
  return [
    {
      label: selectedTimestamp === null ? 'Latest close' : 'Closing price',
      values: columns.map(({ prices }, index) => ({
        text:
          prices.data === undefined && prices.isPending
            ? 'Loading…'
            : selectedTimestamp === null
              ? formatPrice(prices.data?.at(-1)?.price)
              : prices.data === undefined
                ? 'Unavailable'
                : snapshots[index]?.closingPrice === undefined
                  ? 'No observation'
                  : formatPrice(snapshots[index]?.closingPrice),
        tone: 'neutral',
      })),
    },
    {
      label: 'Total return',
      values: metricSources.map((statistics) => {
        const text =
          statistics.data === undefined && statistics.isPending
            ? 'Loading…'
            : formatSignedPercentage(statistics.data?.totalReturnPercent);
        const tone: ComparisonValue['tone'] = text.startsWith('+')
          ? 'positive'
          : text.startsWith('-')
            ? 'negative'
            : 'neutral';
        return { text, tone };
      }),
    },
    {
      label: 'Daily volatility',
      values: metricSources.map((statistics) => ({
        text:
          statistics.data === undefined && statistics.isPending
            ? 'Loading…'
            : statistics.data?.dailyVolatilityPercent === null
              ? 'Not enough observations'
              : formatPercentage(statistics.data?.dailyVolatilityPercent),
        tone: 'neutral',
      })),
    },
    {
      label: 'Max drawdown',
      values: metricSources.map((statistics) => ({
        text:
          statistics.data === undefined && statistics.isPending
            ? 'Loading…'
            : formatPercentage(statistics.data?.maxDrawdownPercent),
        tone: 'neutral',
      })),
    },
  ];
}

/** One polite summary covers status changes without per-cell competing announcements. */
export function getComparisonAnnouncement(
  columns: readonly ComparisonColumn[],
  selectedTimestamp: number | null = null,
): string {
  const queries = columns.flatMap(({ prices, statistics }) =>
    selectedTimestamp === null ? [prices, statistics] : [prices],
  );
  const fetching = queries.filter((query) => query.isFetching).length;
  const failed = queries.filter(
    (query) => query.isError && query.error.kind !== 'cancelled',
  ).length;
  if (fetching > 0)
    return `Updating ${fetching} comparison ${fetching === 1 ? 'resource' : 'resources'}.`;
  if (failed > 0)
    return `${failed} comparison ${failed === 1 ? 'resource is' : 'resources are'} unavailable.`;
  return selectedTimestamp === null
    ? 'Comparison data ready.'
    : `Comparison pinned to ${formatDateTable(selectedTimestamp)}. Statistics include observations through this date.`;
}

/** Show identical recorded windows once while keeping differing histories explicit. */
export function getComparisonPeriods(
  columns: readonly ComparisonColumn[],
  selectedTimestamp: number | null,
): readonly ComparisonPeriod[] {
  const periods = columns.map(({ ticker, prices }) => {
    const data = prices.data;
    if (data === undefined)
      return { ticker, text: prices.isPending ? 'Loading period…' : 'Period unavailable.' };
    const included =
      selectedTimestamp === null
        ? data
        : data.filter(({ date }) => toUtcTimestamp(date) <= selectedTimestamp);
    const firstIncluded = included[0];
    const lastIncluded = included.at(-1);
    const snapshot = {
      observationCount: included.length,
      firstTimestamp: firstIncluded ? toUtcTimestamp(firstIncluded.date) : undefined,
      lastTimestamp: lastIncluded ? toUtcTimestamp(lastIncluded.date) : undefined,
    };
    if (snapshot.observationCount === 0) return { ticker, text: 'No observations in this period.' };
    const through = selectedTimestamp ?? snapshot.lastTimestamp;
    const range = formatDateRange(snapshot.firstTimestamp, through);
    const count = `${snapshot.observationCount} ${snapshot.observationCount === 1 ? 'observation' : 'observations'}`;
    const missing =
      selectedTimestamp !== null && snapshot.lastTimestamp !== selectedTimestamp
        ? ` · Last recorded ${formatDateTable(snapshot.lastTimestamp)}`
        : '';
    return { ticker, text: `${range} · ${count}${missing}` };
  });
  const shared = periods[0]?.text;
  return shared && periods.every(({ text }) => text === shared) ? [{ text: shared }] : periods;
}
