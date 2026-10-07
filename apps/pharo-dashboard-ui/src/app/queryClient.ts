import { QueryClient } from '@tanstack/react-query';

/** Create an isolated cache for the immutable historical dataset. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: 30 * 60 * 1000, retry: false } },
  });
}
