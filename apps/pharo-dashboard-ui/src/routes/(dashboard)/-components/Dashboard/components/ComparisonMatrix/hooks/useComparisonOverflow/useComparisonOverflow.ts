import { useEffect, useRef, useState } from 'react';
import type { ComparisonOverflow } from './types';

/** Keep the scroll cue aligned with actual table overflow as columns and container resize. */
export function useComparisonOverflow(): ComparisonOverflow {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const scroll = scrollRef.current;
    const table = tableRef.current;
    if (!scroll || !table) return;

    const measure = () => setIsOverflowing(scroll.scrollWidth > scroll.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return { scrollRef, tableRef, isOverflowing };
}
