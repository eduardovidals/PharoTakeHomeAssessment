import { useState } from 'react';
import type { PharoChartAppearance } from '@pharo/react-charts';
import { allocateSeriesAppearances, appearanceConfiguration } from './utils';
import type { SeriesAppearanceState } from './types';

/** Allocate one Dashboard instance's shared appearances independently of query data. */
export function useSeriesAppearances(
  selectedIds: readonly string[],
): ReadonlyMap<string, PharoChartAppearance> {
  const configuration = appearanceConfiguration(selectedIds);
  const [state, setState] = useState<SeriesAppearanceState>(() =>
    allocateSeriesAppearances(
      { configuration: '', active: new Map(), history: new Map() },
      selectedIds,
    ),
  );

  if (state.configuration !== configuration) {
    const next = allocateSeriesAppearances(state, selectedIds);
    setState(next);

    return next.active;
  }

  return state.active;
}
