import type { createAppRouter } from '../router';

/** The caller owns router/history/cache creation and disposal. */
export interface AppProvidersProps {
  /** The caller-owned router shares its context cache with QueryClientProvider. */
  readonly router: ReturnType<typeof createAppRouter>;
}
