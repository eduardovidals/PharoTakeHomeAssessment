import type { createAppRouter } from '../../../../app/router';
import type { DashboardAction, DashboardActionOutcome } from '../../-state/types';

/** Actual application Router capabilities used by the instance-owned intention queue. */
export type DashboardActionRouter = Pick<
  ReturnType<typeof createAppRouter>,
  'latestLocation' | 'navigate'
>;

/** Resolve only after navigation, with rejection preserved for the initiating control. */
export type DashboardActionDispatcher = (
  action: DashboardAction,
) => Promise<DashboardActionOutcome>;
