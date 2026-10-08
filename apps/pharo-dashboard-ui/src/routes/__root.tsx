import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { AppRouterContext } from '../app/types';

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
});

/** Keep the root route focused on shared context and file-route composition. */
export function RootLayout() {
  return <Outlet />;
}
