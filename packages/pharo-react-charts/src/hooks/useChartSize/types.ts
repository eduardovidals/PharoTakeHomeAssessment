import type { RefCallback } from 'react';

/** @internal The observed content-box size and typography of one chart container. */
export interface ChartSize {
  /** Width in pixels, initially zero until this container is measured. */
  readonly width: number;
  /** Height in pixels, initially zero until this container is measured. */
  readonly height: number;
  /** Computed axis font size in CSS pixels; 12 is the initial unmeasured fallback. */
  readonly fontSize: number;
}

/** @internal A measurement and callback ref owned by one mounted chart instance. */
export interface ChartMeasurement extends ChartSize {
  /** Attaches the actual container and retires observation before replacement. */
  readonly ref: RefCallback<HTMLDivElement>;
}

/** @internal One ResizeObserver acquisition with an idempotent retirement action. */
export interface ChartObserverOwner {
  /** The native observer acquired for the current container. */
  readonly observer: ResizeObserver;
  /** Rejects later callbacks and disconnects the observer exactly once. */
  readonly retire: () => void;
}
