import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { findNearestTimestamp } from '../../inspection';
import { findPointerTimestamp } from './utils';
import type { ChartInspectionPreview, ChartTouchGesture, UseChartInspectionOptions } from './types';

/** Separate temporary chart preview from consumer-owned commits and native touch scrolling. */
export function useChartInspection(options: UseChartInspectionOptions) {
  const { geometry, timeline, selectedTimestamp, onTimestampChange } = options;
  const controlled = selectedTimestamp !== undefined;
  const [uncontrolledTimestamp, setUncontrolledTimestamp] = useState<number | undefined>();
  const [preview, setPreview] = useState<ChartInspectionPreview | null>(null);
  const touchGesture = useRef<ChartTouchGesture | null>(null);

  if (preview && preview.selection !== selectedTimestamp) setPreview(null);

  let committedTimestamp: number | undefined;

  if (geometry.kind === 'ready') {
    committedTimestamp = controlled
      ? (selectedTimestamp ?? timeline.at(-1))
      : findNearestTimestamp(timeline, uncontrolledTimestamp ?? timeline.at(-1) ?? NaN);

    // The consumer's explicit timestamp is never reconciled or overwritten here.
    if (
      !controlled &&
      uncontrolledTimestamp !== undefined &&
      committedTimestamp !== uncontrolledTimestamp
    )
      setUncontrolledTimestamp(committedTimestamp);
  } else if (!controlled && geometry.kind !== 'unmeasured' && uncontrolledTimestamp !== undefined) {
    setUncontrolledTimestamp(undefined);
  }

  const timestamp =
    controlled && preview?.selection === selectedTimestamp && timeline.includes(preview.timestamp)
      ? preview.timestamp
      : committedTimestamp;
  const navigationTimestamp = controlled
    ? findNearestTimestamp(timeline, committedTimestamp ?? NaN)
    : timestamp;

  const clearPreview = () => setPreview(null);

  const handleInspect = (next: number) => {
    clearPreview();

    if (!controlled) setUncontrolledTimestamp(next);

    onTimestampChange?.(next);
  };

  const inspectPointer = (event: PointerEvent<SVGSVGElement>, commit = false) => {
    if (geometry.kind !== 'ready') return;

    const nearest = findPointerTimestamp(
      geometry,
      timeline,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
    );

    if (nearest === undefined) return;

    if (commit) handleInspect(nearest);
    else if (controlled) setPreview({ timestamp: nearest, selection: selectedTimestamp });
    else setUncontrolledTimestamp(nearest);
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
    if (event.pointerType !== 'touch') {
      if (event.button === 0) inspectPointer(event, true);

      return;
    }

    const gesture = touchGesture.current;

    if (!gesture || gesture.pointerId !== event.pointerId) return;

    touchGesture.current = null;

    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);

    if (!gesture.moved && Number.isFinite(distance) && distance <= 8) inspectPointer(event, true);
  };

  const handlePointerCancel = (event: PointerEvent<SVGSVGElement>) => {
    if (touchGesture.current?.pointerId === event.pointerId) touchGesture.current = null;

    clearPreview();
  };

  return {
    timestamp,
    navigationTimestamp,
    onInspect: handleInspect,
    onNavigationFocus: clearPreview,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: clearPreview,
  };
}
