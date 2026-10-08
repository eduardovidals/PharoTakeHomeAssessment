import { queryOptions, useQueries } from '@tanstack/react-query';
import { requestJson } from '../client';
import { normalizeTicker } from '../instruments';
import type { ApiClient, ApiFailure } from '../types';
import { pricesKey, priceStatsKey } from './keys';
import { priceSeriesSchema, priceStatsSchema } from './schema';
import type { PriceSeries, PriceStats } from './types';

function encodedTicker(ticker: string): string {
  const canonical = normalizeTicker(ticker);

  if (canonical === undefined) throw new TypeError('Invalid instrument identifier.');

  return encodeURIComponent(canonical);
}

/**
 * Read a canonical ticker's full date-only history, preserving unrounded prices.
 * Invalid ticker arguments throw TypeError before I/O; requests consume cancellation.
 * @example
 * ```ts
 * const history = await PricesApi.getPrices(client, 'ABC', signal);
 * ```
 */
export function getPrices(
  client: ApiClient,
  ticker: string,
  signal?: AbortSignal,
): Promise<PriceSeries> {
  return requestJson(client, '/prices/' + encodedTicker(ticker), priceSeriesSchema, signal);
}

/**
 * Observe independent price histories in the requested ticker order.
 * Canonical keys preserve cache reuse, parallel requests and per-ticker cancellation.
 * @example
 * ```tsx
 * const histories = PricesApi.useGetPrices(client, selectedTickers);
 * ```
 */
export function useGetPrices(client: ApiClient, tickers: readonly string[]) {
  return useQueries({
    queries: tickers.map((ticker) => {
      const queryKey = pricesKey(ticker);

      // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
      return queryOptions<PriceSeries, ApiFailure, PriceSeries, ReturnType<typeof pricesKey>>({
        queryKey,
        queryFn: ({ signal, queryKey: key }) => getPrices(client, key[1], signal),
      });
    }),
  });
}

/**
 * Read unrounded percentage-point statistics with required nullable volatility.
 * Service failures and cancellation reject with safe ApiFailure metadata.
 * @example
 * ```ts
 * const statistics = await PricesApi.getPriceStats(client, 'ABC', signal);
 * ```
 */
export function getPriceStats(
  client: ApiClient,
  ticker: string,
  signal?: AbortSignal,
): Promise<PriceStats> {
  return requestJson(
    client,
    '/prices/' + encodedTicker(ticker) + '/stats',
    priceStatsSchema,
    signal,
  );
}

/**
 * Observe independent statistics in the requested ticker order.
 * Each ticker retains its own loading, error and refetch state beside price history.
 * @example
 * ```tsx
 * const statistics = PricesApi.useGetPriceStats(client, selectedTickers);
 * ```
 */
export function useGetPriceStats(client: ApiClient, tickers: readonly string[]) {
  return useQueries({
    queries: tickers.map((ticker) => {
      const queryKey = priceStatsKey(ticker);

      // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
      return queryOptions<PriceStats, ApiFailure, PriceStats, ReturnType<typeof priceStatsKey>>({
        queryKey,
        queryFn: ({ signal, queryKey: key }) => getPriceStats(client, key[1], signal),
      });
    }),
  });
}
