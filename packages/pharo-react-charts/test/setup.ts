import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/** Test-owned delivery lets lifecycle tests deliberately send retired callbacks. */
export class ChartResizeObserver implements ResizeObserver {
  static instances: ChartResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly callback: ResizeObserverCallback;
  readonly observe = vi.fn((target: Element) => {
    this.targets.add(target);
  });
  readonly unobserve = vi.fn((target: Element) => {
    this.targets.delete(target);
  });
  readonly disconnect = vi.fn(() => {
    this.targets.clear();
  });

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ChartResizeObserver.instances.push(this);
  }

  deliver(target: Element, width: number, height: number) {
    const size = { inlineSize: width, blockSize: height };
    this.callback(
      [
        {
          target,
          contentRect: new DOMRectReadOnly(0, 0, width, height),
          borderBoxSize: [size],
          contentBoxSize: [size],
          devicePixelContentBoxSize: [size],
        },
      ],
      this,
    );
  }
}

beforeEach(() => {
  ChartResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', ChartResizeObserver);
});

afterEach(() => {
  try {
    cleanup();
  } finally {
    vi.unstubAllGlobals();
  }
});
