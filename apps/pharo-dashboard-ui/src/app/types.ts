import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';
import type { Root } from 'react-dom/client';
import type { ApiClient, ApiClientConfig } from '../api/types';
import type { createAppRouter } from './router';

/** Resources shared by routes and providers in one application instance. */
export interface AppRouterContext {
  /** The same isolated cache supplied to QueryClientProvider. */
  readonly queryClient: QueryClient;
  /** The instance-owned, configured transport. */
  readonly apiClient: ApiClient;
}

/** Explicit configuration for constructing one owned application graph. */
export interface AppBootstrapOptions {
  /** Optional transport configuration; production uses same-origin /api. */
  readonly apiConfig?: ApiClientConfig;
  /** Optional injected history whose lifetime transfers to this application. */
  readonly history?: RouterHistory;
}

/** A mounted graph and its single, idempotent asynchronous teardown. */
export interface AppInstance extends AppRouterContext {
  /** File-based router sharing this instance's cache and API client. */
  readonly router: ReturnType<typeof createAppRouter>;
  /** Owned browser or injected memory history. */
  readonly history: RouterHistory;
  /** Owned React root, exposed for precise lifecycle integration and tests. */
  readonly root: Root;
  /** Unmount, cancel, clear and release history; repeated calls share one promise. */
  readonly dispose: () => Promise<void>;
}
