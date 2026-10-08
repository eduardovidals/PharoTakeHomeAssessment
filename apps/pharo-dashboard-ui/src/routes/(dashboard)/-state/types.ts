/** Explicit display choice; absence in search derives the mode from selected count. */
export type ChartMode = 'price' | 'performance';

/** Canonical shareable selection and optional explicit chart mode. */
export interface DashboardSearch {
  /** One comma-separated, ordered list of at most three canonical identifiers. */
  readonly tickers?: string;
  /** User choice retained through selection changes; omitted for the derived default. */
  readonly view?: ChartMode;
}

/** Route-owned intentions, evaluated against the latest canonical URL when executed. */
export type DashboardAction =
  | {
      /** Add one canonical instrument without evicting another. */
      readonly type: 'add';
      /** Requested identifier; the transition validates and normalizes it. */
      readonly ticker: string;
    }
  | {
      /** Remove one or more selected instruments in a single navigation. */
      readonly type: 'remove';
      /** Exact removal intentions, never a replacement selection snapshot. */
      readonly tickers: readonly string[];
    }
  | {
      /** Record a deliberate chart-mode choice. */
      readonly type: 'set-view';
      /** Exact supported mode, independent of resource loading. */
      readonly view: ChartMode;
    }
  | {
      /** Clear both selection and explicit mode. */
      readonly type: 'clear';
    };

/** Result shared by route callbacks and the controlled picker selection contract. */
export type DashboardActionOutcome = 'committed' | 'unchanged' | 'limit';

/** Pure proposed URL transition; only the route performs navigation. */
export interface DashboardActionResult {
  /** Resulting validated state without implicit defaults. */
  readonly search: DashboardSearch;
  /** Whether the intention changes state, does nothing, or exceeds the cap. */
  readonly outcome: DashboardActionOutcome;
}

/** The outcome of attempting to add one valid instrument. */
export type SelectionAddOutcome = 'added' | 'already-selected' | 'limit';

/** Safe feedback about the original direct link, separate from committed selection. */
export interface SelectionNotice {
  /** The normalization decision, without rejected input. */
  readonly kind: 'normalized' | 'invalid' | 'limit';
  /** Fixed, readable explanation suitable for the dashboard. */
  readonly message: string;
}

/** A pure selection update that leaves navigation to the route. */
export interface SelectionAddResult {
  /** Canonical resulting search. */
  readonly search: DashboardSearch;
  /** Whether a navigation should occur. */
  readonly outcome: SelectionAddOutcome;
}
