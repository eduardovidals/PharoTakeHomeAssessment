import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { validateDashboardSearch } from '../app/search';
import type { AppRouterContext } from '../app/types';

export const Route = createRootRouteWithContext<AppRouterContext>()({
  validateSearch: validateDashboardSearch,
  component: RootLayout,
});

/** Keep the root route focused on validation and file-route composition. */
export function RootLayout() {
  return <Outlet />;
}
