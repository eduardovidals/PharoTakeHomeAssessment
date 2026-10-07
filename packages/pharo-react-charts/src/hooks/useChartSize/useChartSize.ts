import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartMeasurement, ChartObserverOwner, ChartSize } from './types';

/** Observe one actual container, retiring old ownership before replacement. */
export function useChartSize(): ChartMeasurement {
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const currentElement = useRef<HTMLDivElement | null>(null);
  const owner = useRef<ChartObserverOwner | null>(null);
  const ref = useCallback((next: HTMLDivElement | null) => {
    if (currentElement.current === next) return;
    currentElement.current = next;
    owner.current?.retire();
    owner.current = null;
    setSize((previous) =>
      previous.width === 0 && previous.height === 0 ? previous : { width: 0, height: 0 },
    );
    setElement(next);
  }, []);
  useEffect(() => {
    if (!element) return;
    let retired = false;
    const observer = new ResizeObserver((entries) => {
      if (retired) return;
      const entry = entries.find((candidate) => candidate.target === element);
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    const retire = () => {
      if (retired) return;
      retired = true;
      observer.disconnect();
    };
    owner.current = { observer, retire };
    try {
      observer.observe(element);
    } catch (error) {
      retire();
      if (owner.current?.observer === observer) owner.current = null;
      throw error;
    }
    return () => {
      retire();
      if (owner.current?.observer === observer) owner.current = null;
    };
  }, [element]);
  return { ref, width: size.width, height: size.height };
}
