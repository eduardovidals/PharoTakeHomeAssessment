import type { RefObject } from 'react';

/** Measured overflow belongs to this matrix's native scrolling surface. */
export interface ComparisonOverflow {
  /** Viewport that owns touch, pointer and keyboard scrolling. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Observe intrinsic content width when selection or resource feedback changes. */
  readonly tableRef: RefObject<HTMLTableElement | null>;
  /** Whether some table content lies outside the viewport. */
  readonly isOverflowing: boolean;
}
