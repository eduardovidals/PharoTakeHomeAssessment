import type { z } from 'zod';
import type { ApiClient } from '../../../../api/types';
import type { SelectionAddOutcome } from '../../../../app/types';
import type { instrumentSearchSchema } from './schema';

/** The only form-owned value; committed ticker selection belongs to the route. */
export type InstrumentSearchValues = z.infer<typeof instrumentSearchSchema>;

/** Browse cached instruments and request changes to the route-owned selection. */
export interface InstrumentSelectorProps {
  /** The application's existing client, shared with its query cache. */
  readonly apiClient: ApiClient;
  /** Current URL selection, including instruments absent from the browse list. */
  readonly selectedTickers: readonly string[];
  /** Commit an addition or report the route's duplicate/three-instrument limit. */
  readonly onSelect: (ticker: string) => Promise<SelectionAddOutcome>;
  /** Remove one committed ticker; resolve after navigation completes. */
  readonly onRemove: (ticker: string) => Promise<void>;
  /** Clear only committed selection, preserving the search draft. */
  readonly onClear: () => Promise<void>;
}

/** Complete static styling roles owned by the instrument browser. */
export type InstrumentSelectorStylePart =
  | 'panel'
  | 'heading'
  | 'description'
  | 'search'
  | 'actions'
  | 'selection'
  | 'chips'
  | 'chip'
  | 'results'
  | 'result'
  | 'actionLabel'
  | 'ticker'
  | 'pagination'
  | 'notice'
  | 'error'
  | 'loading';
