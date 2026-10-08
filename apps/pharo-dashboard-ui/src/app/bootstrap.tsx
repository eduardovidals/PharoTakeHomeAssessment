import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { createBrowserHistory } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { createApiClient } from '../api/client';
import { AppProviders } from './AppProviders';
import { createAppQueryClient } from './queryClient';
import { createAppRouter } from './router';
import type { AppBootstrapOptions, AppInstance } from './types';

/** Mount one application graph; failed startup releases every resource already acquired.
 * @example
 * const app = await bootstrapApplication(element);
 *
 * await app.dispose();
 */
export async function bootstrapApplication(
  element: HTMLElement,
  options: AppBootstrapOptions = {},
): Promise<AppInstance> {
  let queryClient: QueryClient | undefined;
  let history: RouterHistory | undefined = options.history;
  let root: Root | undefined;
  let disposal: Promise<void> | undefined;

  const dispose = (): Promise<void> => {
    disposal ??= Promise.resolve().then(async () => {
      const failures: unknown[] = [];
      for (const release of [
        () => root?.unmount(),
        () => queryClient?.cancelQueries(),
        () => queryClient?.clear(),
        () => history?.destroy(),
      ]) {
        try {
          await release();
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length > 0) throw new AggregateError(failures, 'Application cleanup failed');
    });

    return disposal;
  };

  try {
    const apiClient = createApiClient(options.apiConfig);
    queryClient = createAppQueryClient();
    history ??= createBrowserHistory();
    const router = createAppRouter({ queryClient, apiClient }, history);
    root = createRoot(element);

    await router.load();
    root.render(
      <StrictMode>
        <AppProviders router={router} />
      </StrictMode>,
    );

    return { apiClient, queryClient, history, router, root, dispose };
  } catch (primaryError) {
    const [cleanup] = await Promise.allSettled([dispose()]);
    if (cleanup?.status === 'rejected') {
      throw new AggregateError(
        [primaryError, cleanup.reason],
        'Application startup and cleanup failed',
        {
          cause: primaryError,
        },
      );
    }

    throw primaryError;
  }
}
