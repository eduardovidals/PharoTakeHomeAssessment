import { normalizeTicker } from '../api/instruments';
import type { DashboardSearch, SelectionAddResult, SelectionNotice } from './types';

const noticeMessages = {
  invalid: "The link's instrument selection is invalid.",
  limit: 'Only the first three instruments in this link are selected.',
  normalized: "The link's instrument selection was normalized.",
} as const;

function normalizeSelection(input: unknown): {
  search: DashboardSearch;
  notice?: SelectionNotice;
} {
  const raw =
    typeof input === 'object' && input !== null && !Array.isArray(input) && 'tickers' in input
      ? input.tickers
      : undefined;
  if (raw === undefined || raw === '') return { search: {} };
  if (typeof raw !== 'string') {
    return { search: {}, notice: { kind: 'invalid', message: noticeMessages.invalid } };
  }
  const unique = new Set<string>();
  for (const token of raw.split(',')) {
    const ticker = normalizeTicker(token);
    if (ticker !== undefined) unique.add(ticker);
  }
  const tickers = [...unique];
  if (tickers.length === 0) {
    return { search: {}, notice: { kind: 'invalid', message: noticeMessages.invalid } };
  }
  const canonical = tickers.slice(0, 3).join(',');
  const kind = tickers.length > 3 ? 'limit' : raw !== canonical ? 'normalized' : undefined;
  return {
    search: { tickers: canonical },
    ...(kind === undefined ? {} : { notice: { kind, message: noticeMessages[kind] } }),
  };
}

function requireTicker(value: string): string {
  const ticker = normalizeTicker(value);
  if (ticker === undefined) throw new TypeError('A valid instrument identifier is required.');
  return ticker;
}

/** Preserve raw string identifiers; repeated ticker parameters deliberately fail validation. */
export function parseDashboardSearch(raw: string): Record<string, unknown> {
  const values = new URLSearchParams(raw).getAll('tickers');
  if (values.length === 0) return {};
  return { tickers: values.length === 1 ? values[0] : values };
}

/** Serialize only the canonical selection, using normal URL percent encoding. */
export function stringifyDashboardSearch(search: Record<string, unknown>): string {
  const { tickers } = validateDashboardSearch(search);
  return tickers === undefined ? '' : `?${new URLSearchParams({ tickers }).toString()}`;
}

/** Normalize an untrusted Router search value without throwing or inventing a default. */
export function validateDashboardSearch(input: unknown): DashboardSearch {
  return normalizeSelection(input).search;
}

/** Derive selected IDs from the authoritative validated search; never retain a second store. */
export function getSelectedTickers(search: DashboardSearch): readonly string[] {
  return validateDashboardSearch(search).tickers?.split(',') ?? [];
}

/** Explain the original link without interpolating rejected input or changing its URL. */
export function getSelectionNotice(raw: string): SelectionNotice | undefined {
  return normalizeSelection(parseDashboardSearch(raw)).notice;
}

/** Add one valid ticker, preserving first-selection order and the three-instrument limit. */
export function addSelectedTicker(search: DashboardSearch, value: string): SelectionAddResult {
  const ticker = requireTicker(value);
  const selected = getSelectedTickers(search);
  const canonical = validateDashboardSearch(search);
  if (selected.includes(ticker)) return { search: canonical, outcome: 'already-selected' };
  if (selected.length === 3) return { search: canonical, outcome: 'limit' };
  return { search: { tickers: [...selected, ticker].join(',') }, outcome: 'added' };
}

/** Remove a valid identifier without changing the order of remaining selections. */
export function removeSelectedTicker(search: DashboardSearch, value: string): DashboardSearch {
  const ticker = requireTicker(value);
  const remaining = getSelectedTickers(search).filter((selected) => selected !== ticker);
  return remaining.length === 0 ? {} : { tickers: remaining.join(',') };
}

/** Clear committed selection without an implicit replacement instrument. */
export function clearSelectedTickers(): DashboardSearch {
  return {};
}
