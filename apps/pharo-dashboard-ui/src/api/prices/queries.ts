import { queryOptions } from '@tanstack/react-query';
import type { ApiClient, ApiFailure } from '../types';
import { getPrices, getPriceStats } from './PricesApi';
import { pricesKey, priceStatsKey } from './keys';
import type { PriceSeries, PriceStats } from './types';

/**
 * Share canonical history options with Query's real transport cancellation signal.
 * @example
 * ```tsx
 * const history = useQuery(pricesQueryOptions(client, ticker));
 * ```
 */
export function pricesQueryOptions(client: ApiClient, ticker: string) {
  const queryKey = pricesKey(ticker);
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
  return queryOptions<PriceSeries, ApiFailure, PriceSeries, ReturnType<typeof pricesKey>>({
    queryKey,
    queryFn: ({ signal, queryKey: key }) => getPrices(client, key[1], signal),
  });
}

/**
 * Share canonical statistics options without aggregating selection-order keys.
 * @example
 * ```tsx
 * const statistics = useQuery(priceStatsQueryOptions(client, ticker));
 * ```
 */
export function priceStatsQueryOptions(client: ApiClient, ticker: string) {
  const queryKey = priceStatsKey(ticker);
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
  return queryOptions<PriceStats, ApiFailure, PriceStats, ReturnType<typeof priceStatsKey>>({
    queryKey,
    queryFn: ({ signal, queryKey: key }) => getPriceStats(client, key[1], signal),
  });
}
