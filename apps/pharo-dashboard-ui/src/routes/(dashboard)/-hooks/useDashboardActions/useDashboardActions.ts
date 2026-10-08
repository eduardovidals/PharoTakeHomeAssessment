import { useRef } from 'react';
import { applyDashboardAction, validateDashboardSearch } from '../../-state/search';
import type { DashboardActionOutcome } from '../../-state/types';
import type { DashboardActionDispatcher, DashboardActionRouter } from './types';

/** Serialize route intentions; every action reads the actual latest URL at execution time. */
export function useDashboardActions(router: DashboardActionRouter): DashboardActionDispatcher {
  const tail = useRef<Promise<void>>(Promise.resolve());
  const dispatch: DashboardActionDispatcher = (action) => {
    const pending = tail.current.then<DashboardActionOutcome>(async () => {
      const current = validateDashboardSearch(router.latestLocation.search);
      const result = applyDashboardAction(current, action);
      if (result.outcome !== 'committed') return result.outcome;
      await router.navigate({ to: '/', search: result.search });
      const actual = validateDashboardSearch(router.latestLocation.search);
      // A competing external navigation may cancel this transition without rejecting it.
      return actual.tickers === result.search.tickers && actual.view === result.search.view
        ? 'committed'
        : 'unchanged';
    });
    tail.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  return dispatch;
}
