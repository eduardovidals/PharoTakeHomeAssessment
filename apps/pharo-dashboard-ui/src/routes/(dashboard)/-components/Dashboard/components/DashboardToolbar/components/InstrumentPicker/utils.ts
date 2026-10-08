import type { PharoSelectionAction } from '@pharo/react-components';
import type { DashboardAction } from '../../../../../../-state/types';
import type { InstrumentItem } from './types';

/** Rank an immutable ticker list by exact, prefix and contains matches, then ordinal key. */
export function rankInstruments(tickers: readonly string[], query: string): InstrumentItem[] {
  const normalized = query.trim().toUpperCase();
  return tickers
    .filter((ticker) => ticker.includes(normalized))
    .map((ticker) => ({
      ticker,
      rank: ticker === normalized ? 0 : ticker.startsWith(normalized) ? 1 : 2,
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        (left.ticker < right.ticker ? -1 : left.ticker > right.ticker ? 1 : 0),
    )
    .map(({ ticker }) => ({ ticker }));
}

/** Accept only known string additions; existing unknown string tags remain removable. */
export function toDashboardAction(
  action: PharoSelectionAction,
  known: readonly string[],
): DashboardAction | undefined {
  if (action.kind === 'clear') return { type: 'clear' };
  if (action.kind === 'add') {
    return typeof action.key === 'string' && known.includes(action.key)
      ? { type: 'add', ticker: action.key }
      : undefined;
  }

  const tickers = action.keys.filter((key): key is string => typeof key === 'string');
  return tickers.length === action.keys.length ? { type: 'remove', tickers } : undefined;
}
