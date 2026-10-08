import type { PharoChartSeries } from '@pharo/react-charts';
import { getSeriesWindows, haveMismatchedWindows } from '../../adapters/priceSeries';
import type { ObservationWindowGroup } from './types';

/** Share metadata only when the recorded range, count and performance base all agree. */
export function getObservationWindowGroups(
  series: readonly PharoChartSeries[],
): readonly ObservationWindowGroup[] {
  const windows = getSeriesWindows(series);
  const groups: ObservationWindowGroup[] = [];

  for (const item of series) {
    const window = windows.find((candidate) => candidate.id === item.id);
    const index = window
      ? groups.findIndex((group) => group.window && !haveMismatchedWindows([group.window, window]))
      : -1;
    const group = groups[index];
    if (group) {
      groups[index] = { ...group, labels: [...group.labels, item.label] };
    } else {
      groups.push({ id: item.id, labels: [item.label], ...(window ? { window } : {}) });
    }
  }

  return groups;
}
