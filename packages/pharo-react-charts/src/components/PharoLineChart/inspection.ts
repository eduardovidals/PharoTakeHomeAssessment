import { bisectLeft } from 'd3-array';

/** @internal Select a recorded timestamp, clamping bounds and choosing earlier ties. */
export function findNearestTimestamp(
  timeline: readonly number[],
  candidate: number,
): number | undefined {
  if (!Number.isFinite(candidate) || timeline.length === 0) return undefined;

  const insertion = bisectLeft(timeline, candidate);
  const earlier = timeline[insertion - 1];
  const later = timeline[insertion];

  if (earlier === undefined) return later;

  if (later === undefined) return earlier;

  return candidate - earlier <= later - candidate ? earlier : later;
}
