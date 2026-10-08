import { QueryClient } from '@tanstack/react-query';
import { isApiFailure } from '../api/client';

/** Create an isolated cache for the immutable historical dataset. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        retry: (failureCount, error) => {
          if (failureCount >= 2 || !isApiFailure(error)) return false;

          return (
            error.kind === 'network' ||
            error.kind === 'timeout' ||
            (error.kind === 'http' && error.status !== undefined && error.status >= 500)
          );
        },
      },
    },
  });
}
