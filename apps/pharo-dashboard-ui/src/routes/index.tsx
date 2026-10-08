import { useSyncExternalStore } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { getEffectiveChartMode, getSelectedTickers, getSelectionNotice } from '../app/search';
import { Dashboard } from '../features/dashboard';
import { useDashboardActions } from './-hooks/useDashboardActions';

export const Route = createFileRoute('/')({ component: DashboardRoute });

/** Adapt authoritative URL state and shared resources to the dashboard feature. */
export function DashboardRoute() {
  const search = Route.useSearch();
  const { apiClient } = Route.useRouteContext();
  const router = useRouter();
  // Router re-stringifies parsed locations. Its owned history retains the actual
  // direct-link text so a normalization notice survives until intentional navigation.
  const rawSearch = useSyncExternalStore(
    router.history.subscribe,
    () => router.history.location.search,
    () => router.history.location.search,
  );

  const dispatch = useDashboardActions(router);

  return (
    <Dashboard
      apiClient={apiClient}
      selectedTickers={getSelectedTickers(search)}
      mode={getEffectiveChartMode(search)}
      selectionNotice={getSelectionNotice(rawSearch)}
      onAction={dispatch}
    />
  );
}
