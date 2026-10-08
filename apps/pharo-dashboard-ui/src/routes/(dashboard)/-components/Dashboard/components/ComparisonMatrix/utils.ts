import {
  formatPercentage,
  formatPrice,
  formatSignedPercentage,
} from '../../../../../../utils/number';
import type {
  ComparisonColumn,
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

/** Present the latest raw close and the backend’s full-window statistics. */
export function getComparisonRows(columns: readonly ComparisonColumn[]): readonly ComparisonRow[] {
  return [
    {
      label: 'Latest close',
      values: columns.map(({ prices }) => ({
        text:
          prices.data === undefined && prices.isPending
            ? 'Loading…'
            : formatPrice(prices.data?.at(-1)?.price),
        tone: 'neutral',
      })),
    },
    {
      label: 'Total return',
      values: columns.map(({ statistics }) => {
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
      values: columns.map(({ statistics }) => ({
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
      values: columns.map(({ statistics }) => ({
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
export function getComparisonAnnouncement(columns: readonly ComparisonColumn[]): string {
  const queries = columns.flatMap(({ prices, statistics }) => [prices, statistics]);
  const fetching = queries.filter((query) => query.isFetching).length;
  const failed = queries.filter(
    (query) => query.isError && query.error.kind !== 'cancelled',
  ).length;

  if (fetching > 0)
    return `Updating ${fetching} comparison ${fetching === 1 ? 'resource' : 'resources'}.`;
  if (failed > 0)
    return `${failed} comparison ${failed === 1 ? 'resource is' : 'resources are'} unavailable.`;

  return 'Comparison data ready.';
}
