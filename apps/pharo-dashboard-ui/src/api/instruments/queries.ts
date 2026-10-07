import { queryOptions } from '@tanstack/react-query';
import type { ApiClient, ApiFailure } from '../types';
import { getInstruments } from './InstrumentsApi';
import { instrumentsKey } from './keys';
import type { Instruments } from './types';

/**
 * Share one instrument key and real consumed signal across hooks and prefetches.
 * Cache lifetime and retries belong to the application QueryClient.
 * @example
 * ```tsx
 * const instruments = useQuery(instrumentsQueryOptions(client));
 * ```
 */
export function instrumentsQueryOptions(client: ApiClient) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- One cache owns one injected client; transport identity is not part of the resource key.
  return queryOptions<Instruments, ApiFailure>({
    queryKey: instrumentsKey,
    queryFn: ({ signal }) => getInstruments(client, signal),
  });
}
