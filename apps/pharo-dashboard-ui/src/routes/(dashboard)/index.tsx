import { useSyncExternalStore } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  getEffectiveChartMode,
  getSelectedTickers,
  getSelectionNotice,
  validateDashboardSearch,
} from './-state/search';
import { Dashboard } from './-components/Dashboard';
import { useDashboardActions } from './-hooks/useDashboardActions';

export const Route = createFileRoute('/(dashboard)/')({
  validateSearch: validateDashboardSearch,
  component: DashboardRoute,
});

/** Adapt authoritative page URL state and shared resources to the dashboard owner. */
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
