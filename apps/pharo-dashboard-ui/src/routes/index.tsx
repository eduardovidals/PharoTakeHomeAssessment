import { useSyncExternalStore } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  addSelectedTicker,
  clearSelectedTickers,
  getSelectedTickers,
  getSelectionNotice,
  removeSelectedTicker,
  validateDashboardSearch,
} from '../app/search';
import type { SelectionAddOutcome } from '../app/types';
import { Dashboard } from '../features/dashboard/components/Dashboard';

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

  async function selectTicker(ticker: string): Promise<SelectionAddOutcome> {
    const update = addSelectedTicker(validateDashboardSearch(router.latestLocation.search), ticker);
    if (update.outcome === 'added') await router.navigate({ to: '/', search: update.search });
    return update.outcome;
  }

  async function removeTicker(ticker: string): Promise<void> {
    const current = validateDashboardSearch(router.latestLocation.search);
    const next = removeSelectedTicker(current, ticker);
    if (next.tickers !== current.tickers) await router.navigate({ to: '/', search: next });
  }

  async function clearSelection(): Promise<void> {
    await router.navigate({ to: '/', search: clearSelectedTickers() });
  }

  return (
    <Dashboard
      apiClient={apiClient}
      selectedTickers={getSelectedTickers(search)}
      selectionNotice={getSelectionNotice(rawSearch)}
      onSelect={selectTicker}
      onRemove={removeTicker}
      onClear={clearSelection}
    />
  );
}
