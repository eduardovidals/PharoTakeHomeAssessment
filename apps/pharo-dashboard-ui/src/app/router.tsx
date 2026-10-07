import { createRouter } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';
import { parseDashboardSearch, stringifyDashboardSearch } from './search';
import type { AppRouterContext } from './types';

/** Compose file routes with the cache owned by this application instance. */
export function createAppRouter(context: AppRouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    parseSearch: parseDashboardSearch,
    stringifySearch: stringifyDashboardSearch,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
