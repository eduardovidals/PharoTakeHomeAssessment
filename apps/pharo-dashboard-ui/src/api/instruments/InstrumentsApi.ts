import { useQuery } from '@tanstack/react-query';
import { requestJson } from '../client';
import type { ApiClient, ApiFailure } from '../types';
import { instrumentsKey } from './keys';
import { instrumentsSchema } from './schema';
import type { Instruments } from './types';

/**
 * Read the complete sorted instrument collection with runtime validation.
 * Cancellation and service failures reject with safe ApiFailure metadata.
 * @example
 * ```ts
 * const tickers = await InstrumentsApi.getInstruments(client, signal);
 * ```
 */
export function getInstruments(client: ApiClient, signal?: AbortSignal): Promise<Instruments> {
  return requestJson(client, '/instruments', instrumentsSchema, signal);
}

/**
 * Observe one shared instrument collection with transport cancellation.
 * Cache lifetime and retries belong to the application QueryClient.
 * @example
 * ```tsx
 * const instruments = InstrumentsApi.useGetInstruments(client);
 * ```
 */
export function useGetInstruments(client: ApiClient) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
  return useQuery<Instruments, ApiFailure>({
    queryKey: instrumentsKey,
    queryFn: ({ signal }) => getInstruments(client, signal),
  });
}
