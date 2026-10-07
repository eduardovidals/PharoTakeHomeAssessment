import type { createAppRouter } from '../../router';

/** The caller owns router/history/cache creation and disposal. */
export interface AppProvidersProps {
  router: ReturnType<typeof createAppRouter>;
}
