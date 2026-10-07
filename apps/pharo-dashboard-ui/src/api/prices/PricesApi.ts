import { requestJson } from '../client';
import { normalizeTicker } from '../instruments';
import type { ApiClient } from '../types';
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
 * const history = await getPrices(client, 'ABC', signal);
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
 * Read unrounded percentage-point statistics with required nullable volatility.
 * Service failures and cancellation reject with safe ApiFailure metadata.
 * @example
 * ```ts
 * const statistics = await getPriceStats(client, 'ABC', signal);
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
