import { normalizeTicker } from '../../../api/instruments';
import type {
  ChartMode,
  DashboardAction,
  DashboardActionResult,
  DashboardSearch,
  SelectionAddResult,
  SelectionNotice,
} from './types';

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

function normalizeSearch(input: unknown): { search: DashboardSearch; notice?: SelectionNotice } {
  const selection = normalizeSelection(input);
  const rawView =
    typeof input === 'object' && input !== null && !Array.isArray(input) && 'view' in input
      ? input.view
      : undefined;
  const validView = rawView === 'price' || rawView === 'performance';
  const invalidView = rawView !== undefined && !validView;
  const notice =
    selection.notice?.kind === 'invalid' || selection.notice?.kind === 'limit'
      ? selection.notice
      : invalidView
        ? { kind: 'invalid' as const, message: "The link's chart view is invalid." }
        : selection.notice;
  return {
    search: validView ? { ...selection.search, view: rawView } : selection.search,
    ...(notice ? { notice } : {}),
  };
}

/** Preserve raw contract fields; repeated parameters deliberately fail validation. */
export function parseDashboardSearch(raw: string): Record<string, unknown> {
  const parameters = new URLSearchParams(raw);
  const search: Record<string, unknown> = {};
  for (const field of ['tickers', 'view']) {
    const values = parameters.getAll(field);
    if (values.length > 0) search[field] = values.length === 1 ? values[0] : values;
  }
  return search;
}

/** Serialize canonical selection and explicit view; never write the derived default. */
export function stringifyDashboardSearch(search: Record<string, unknown>): string {
  const canonical = validateDashboardSearch(search);
  const parameters = new URLSearchParams();
  if (canonical.tickers !== undefined) parameters.set('tickers', canonical.tickers);
  if (canonical.view !== undefined) parameters.set('view', canonical.view);
  const encoded = parameters.toString();
  return encoded ? `?${encoded}` : '';
}

/** Independently normalize untrusted selection and view without inventing either. */
export function validateDashboardSearch(input: unknown): DashboardSearch {
  return normalizeSearch(input).search;
}

/** Derive selected IDs from the authoritative validated search; never retain a second store. */
export function getSelectedTickers(search: DashboardSearch): readonly string[] {
  return validateDashboardSearch(search).tickers?.split(',') ?? [];
}

/** Explain the original link without interpolating rejected input or changing its URL. */
export function getSelectionNotice(raw: string): SelectionNotice | undefined {
  return normalizeSearch(parseDashboardSearch(raw)).notice;
}

/** Add one valid ticker, preserving first-selection order and the three-instrument limit. */
export function addSelectedTicker(search: DashboardSearch, value: string): SelectionAddResult {
  const ticker = requireTicker(value);
  const selected = getSelectedTickers(search);
  const canonical = validateDashboardSearch(search);
  if (selected.includes(ticker)) return { search: canonical, outcome: 'already-selected' };
  if (selected.length === 3) return { search: canonical, outcome: 'limit' };
  return { search: { ...canonical, tickers: [...selected, ticker].join(',') }, outcome: 'added' };
}

/** Remove a valid identifier without changing the order of remaining selections. */
export function removeSelectedTicker(search: DashboardSearch, value: string): DashboardSearch {
  const ticker = requireTicker(value);
  const remaining = getSelectedTickers(search).filter((selected) => selected !== ticker);
  const { view } = validateDashboardSearch(search);
  return {
    ...(remaining.length === 0 ? {} : { tickers: remaining.join(',') }),
    ...(view === undefined ? {} : { view }),
  };
}

/** Clear committed selection without an implicit replacement instrument. */
export function clearSelectedTickers(): DashboardSearch {
  return {};
}

/** Derive only absent mode from canonical selected keys, including pending/unknown IDs. */
export function getEffectiveChartMode(search: DashboardSearch): ChartMode {
  const canonical = validateDashboardSearch(search);
  return canonical.view ?? (getSelectedTickers(canonical).length > 1 ? 'performance' : 'price');
}

/** Persist a deliberate choice even when it equals the current derived default. */
export function setDashboardView(search: DashboardSearch, view: ChartMode): DashboardSearch {
  if (view !== 'price' && view !== 'performance')
    throw new TypeError('A valid chart view is required.');
  return { ...validateDashboardSearch(search), view };
}

/** Apply one intention without retaining another selection or data owner. */
export function applyDashboardAction(
  search: DashboardSearch,
  action: DashboardAction,
): DashboardActionResult {
  const current = validateDashboardSearch(search);
  let next: DashboardSearch;
  switch (action.type) {
    case 'add': {
      const result = addSelectedTicker(current, action.ticker);
      return {
        search: result.search,
        outcome:
          result.outcome === 'added'
            ? 'committed'
            : result.outcome === 'limit'
              ? 'limit'
              : 'unchanged',
      };
    }
    case 'remove':
      next = action.tickers.reduce(
        (selection, ticker) => removeSelectedTicker(selection, ticker),
        current,
      );
      break;
    case 'set-view':
      next = setDashboardView(current, action.view);
      break;
    case 'clear':
      next = clearSelectedTickers();
      break;
    default:
      throw new TypeError('A valid dashboard action is required.');
  }
  return {
    search: next,
    outcome:
      next.tickers === current.tickers && next.view === current.view ? 'unchanged' : 'committed',
  };
}
