import { requestJson } from '../client';
import type { ApiClient } from '../types';
import { instrumentsSchema } from './schema';
import type { Instruments } from './types';

/**
 * Read the complete sorted instrument collection with runtime validation.
 * Cancellation and service failures reject with safe ApiFailure metadata.
 * @example
 * ```ts
 * const tickers = await getInstruments(client, signal);
 * ```
 */
export function getInstruments(client: ApiClient, signal?: AbortSignal): Promise<Instruments> {
  return requestJson(client, '/instruments', instrumentsSchema, signal);
}
