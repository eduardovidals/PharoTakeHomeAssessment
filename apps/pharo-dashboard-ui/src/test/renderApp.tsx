import { queries, render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';
import { createApiClient } from '../api/client';
import type { ApiClient, ApiClientConfig } from '../api/types';
import { AppProviders } from '../app/AppProviders';
import { createAppQueryClient } from '../app/queryClient';
import { createAppRouter } from '../app/router';

export interface AppTest {
  apiClient: ApiClient;
  queryClient: QueryClient;
  history: RouterHistory;
  router: ReturnType<typeof createAppRouter>;
  container: HTMLDivElement;
  view: RenderResult;
  dispose: () => Promise<void>;
}

interface RenderAppOptions {
  initialEntries?: string[];
  /** Explicit transport overrides; the default test origin is intercepted by MSW. */
  apiConfig?: ApiClientConfig;
  /** Configure the real cache/router after the neutral view has a cleanup owner. */
  configure?: (app: AppTest) => void | Promise<void>;
}

const activeDisposals = new Set<() => Promise<void>>();

/** Render the actual application graph with resources owned by this test alone. */
export async function renderApp(options: RenderAppOptions = {}): Promise<AppTest> {
  let queryClient: QueryClient | undefined;
  let history: RouterHistory | undefined;
  let container: HTMLDivElement | undefined;
  let view: RenderResult | undefined;
  let disposal: Promise<void> | undefined;

  function dispose(): Promise<void> {
    disposal ??= Promise.resolve().then(async () => {
      const failures: unknown[] = [];

      async function attempt(release: () => void | Promise<void>) {
        try {
          await release();
        } catch (error) {
          failures.push(error);
        }
      }

      // Every release runs even if an earlier owner fails. No global RTL cleanup here.
      await attempt(() => view?.unmount());
      await attempt(() => queryClient?.cancelQueries());
      await attempt(() => queryClient?.clear());
      await attempt(() => history?.destroy());
      await attempt(() => container?.remove());
      activeDisposals.delete(dispose);

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Application test cleanup failed');
      }
    });

    return disposal;
  }

  // Register before acquiring anything that may throw or await.
  activeDisposals.add(dispose);

  try {
    const apiClient = createApiClient({ baseURL: 'http://localhost/api', ...options.apiConfig });
    queryClient = createAppQueryClient();
    history = createMemoryHistory({ initialEntries: options.initialEntries ?? ['/'] });
    const router = createAppRouter({ queryClient, apiClient }, history);

    container = document.createElement('div');
    document.body.append(container);
    view = render(null, { container, baseElement: container, queries });

    const app = { apiClient, queryClient, history, router, container, view, dispose };
    await options.configure?.(app);

    await router.load();
    view.rerender(<AppProviders router={router} />);

    return app;
  } catch (primaryError) {
    const [cleanupResult] = await Promise.allSettled([dispose()]);
    if (cleanupResult?.status === 'rejected') {
      throw new AggregateError(
        [primaryError, cleanupResult.reason],
        'Application test startup and cleanup failed',
        { cause: primaryError },
      );
    }

    throw primaryError;
  }
}

/** The sole setup owner awaits all graphs left open by a test. */
export async function cleanupAppTests(): Promise<void> {
  const results = await Promise.allSettled([...activeDisposals].map((dispose) => dispose()));
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );

  if (failures.length > 0) {
    throw new AggregateError(failures, 'Application test suite cleanup failed');
  }
}
