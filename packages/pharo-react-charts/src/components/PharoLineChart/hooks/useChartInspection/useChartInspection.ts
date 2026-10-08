import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { findNearestTimestamp } from '../../inspection';
import { findPointerTimestamp } from './utils';
import type { ChartTouchGesture, UseChartInspectionOptions } from './types';

/** Own explicit inspection and touch-tap discrimination without intercepting native scrolling. */
export function useChartInspection(options: UseChartInspectionOptions) {
  const { geometry, timeline } = options;
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | undefined>();
  const touchGesture = useRef<ChartTouchGesture | null>(null);
  let timestamp: number | undefined;
  if (geometry.kind === 'ready') {
    timestamp = findNearestTimestamp(timeline, selectedTimestamp ?? timeline.at(-1) ?? NaN);
    // Only a user choice becomes state; later async records keep the implicit latest fresh.
    if (selectedTimestamp !== undefined && timestamp !== selectedTimestamp)
      setSelectedTimestamp(timestamp);
  } else if (geometry.kind !== 'unmeasured' && selectedTimestamp !== undefined) {
    setSelectedTimestamp(undefined);
  }

  const inspectPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (geometry.kind !== 'ready') return;
    const nearest = findPointerTimestamp(
      geometry,
      timeline,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
    );
    if (nearest !== undefined) setSelectedTimestamp(nearest);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    const previous = touchGesture.current;
    if (previous && previous.pointerId !== event.pointerId) {
      touchGesture.current = { ...previous, moved: true };
      return;
    }
    touchGesture.current =
      geometry.kind === 'ready' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
        : null;
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') {
      inspectPointer(event);
      return;
    }
    const gesture = touchGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!Number.isFinite(distance) || distance > 8)
      touchGesture.current = { ...gesture, moved: true };
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    const gesture = touchGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    touchGesture.current = null;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.moved && Number.isFinite(distance) && distance <= 8) inspectPointer(event);
  };

  const handlePointerCancel = (event: PointerEvent<SVGSVGElement>) => {
    if (touchGesture.current?.pointerId === event.pointerId) touchGesture.current = null;
  };

  return {
    timestamp,
    onInspect: setSelectedTimestamp,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };
}
