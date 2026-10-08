import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { AppProvidersProps as Props } from './types';

/** Share the router's cache with every rendered query observer.
 * @example
 * ```tsx
 * <AppProviders router={router} />
 * ```
 */
export function AppProviders(props: Props) {
  const { router } = props;

  return (
    <QueryClientProvider client={router.options.context.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
