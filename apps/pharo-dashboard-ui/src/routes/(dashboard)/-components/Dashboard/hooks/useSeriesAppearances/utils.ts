import type { PharoChartAppearance } from '@pharo/react-charts';
import type { SeriesAppearanceState } from './types';

const slots: readonly PharoChartAppearance[] = ['primary', 'secondary', 'tertiary'];

/** Validate the canonical route boundary before allocating semantic identities. */
export function appearanceConfiguration(selectedIds: readonly string[]): string {
  if (
    !Array.isArray(selectedIds) ||
    selectedIds.length > slots.length ||
    new Set(selectedIds).size !== selectedIds.length ||
    [...selectedIds].some((id) => typeof id !== 'string' || !id.trim())
  )
    throw new TypeError('Expected up to three distinct selected identifiers.');
  return JSON.stringify(selectedIds);
}

/** Preserve survivors before assigning free historical or new slots; never mutate maps. */
export function allocateSeriesAppearances(
  previous: SeriesAppearanceState,
  selectedIds: readonly string[],
): SeriesAppearanceState {
  const configuration = appearanceConfiguration(selectedIds);
  const active = new Map<string, PharoChartAppearance>();
  const occupied = new Set<PharoChartAppearance>();
  for (const id of selectedIds) {
    const retained = previous.active.get(id);
    if (retained) {
      active.set(id, retained);
      occupied.add(retained);
    }
  }
  for (const id of selectedIds) {
    if (active.has(id)) continue;
    const preferred = previous.history.get(id);
    const appearance =
      preferred && !occupied.has(preferred) ? preferred : slots.find((slot) => !occupied.has(slot));
    if (!appearance) throw new Error('Selected identifiers require distinct appearance slots.');
    active.set(id, appearance);
    occupied.add(appearance);
  }
  const history = new Map(previous.history);
  for (const [id, appearance] of active) history.set(id, appearance);
  return { configuration, active, history };
}
