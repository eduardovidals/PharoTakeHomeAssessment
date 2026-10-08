import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartMeasurement, ChartObserverOwner, ChartSize } from './types';

/** Observe one actual container, retiring old ownership before replacement. */
export function useChartSize(): ChartMeasurement {
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0, fontSize: 12 });
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const currentElement = useRef<HTMLDivElement | null>(null);
  const owner = useRef<ChartObserverOwner | null>(null);
  const ref = useCallback((next: HTMLDivElement | null) => {
    if (currentElement.current === next) return;
    currentElement.current = next;
    owner.current?.retire();
    owner.current = null;
    setSize((previous) =>
      previous.width === 0 && previous.height === 0 && previous.fontSize === 12
        ? previous
        : { width: 0, height: 0, fontSize: 12 },
    );
    setElement(next);
  }, []);
  useEffect(() => {
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;
    let retired = false;
    const readFontSize = () => {
      const measured = Number.parseFloat(view.getComputedStyle(element).fontSize);
      return Number.isFinite(measured) && measured > 0 ? measured : 12;
    };
    const refreshTypography = () => {
      if (retired) return;
      const fontSize = readFontSize();
      setSize((previous) =>
        previous.fontSize === fontSize ? previous : { ...previous, fontSize },
      );
    };
    const observer = new ResizeObserver((entries) => {
      if (retired) return;
      const entry = entries.find((candidate) => candidate.target === element);
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const fontSize = readFontSize();
      setSize((previous) =>
        previous.width === width && previous.height === height && previous.fontSize === fontSize
          ? previous
          : { width, height, fontSize },
      );
    });
    const typographyObserver = new view.MutationObserver(refreshTypography);
    const retire = () => {
      if (retired) return;
      retired = true;
      observer.disconnect();
      typographyObserver.disconnect();
      view.removeEventListener('resize', refreshTypography);
    };
    owner.current = { observer, retire };
    try {
      observer.observe(element);
      // A root text-size or inherited class change need not resize a fixed-pixel chart.
      for (
        let ancestor: HTMLElement | null = element;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        typographyObserver.observe(ancestor, {
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
      }
      view.addEventListener('resize', refreshTypography);
      refreshTypography();
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
  return { ref, width: size.width, height: size.height, fontSize: size.fontSize };
}
