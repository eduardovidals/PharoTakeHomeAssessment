import { utcFormat } from 'd3-time-format';
import type {
  ChartAxisLabel,
  ChartIdentityState,
  ChartTick,
  PharoChartAppearance,
  PharoChartSeries,
} from './types';

const appearanceOrder: readonly PharoChartAppearance[] = ['primary', 'secondary', 'tertiary'];
const utcDate = utcFormat('%Y-%m-%d');

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  // Extended years retain their full date instead of the formatter's four digits.
  return year < 0 || year > 9999 ? (date.toISOString().split('T')[0] ?? '') : utcDate(date);
}

export function formatNumber(value: number): string {
  return value.toString();
}

export function identityConfiguration(series: readonly PharoChartSeries[]): string {
  if (
    !Array.isArray(series) ||
    series.length > 3 ||
    series.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        (item.appearance !== undefined && !appearanceOrder.includes(item.appearance)),
    )
  ) {
    return 'invalid';
  }
  return JSON.stringify(series.map((item) => [item.id, item.appearance ?? null]));
}

export function compactLabel(label: string, characters: number): string {
  const symbols = Array.from(label);
  return symbols.length > characters ? symbols.slice(0, characters - 1).join('') + '…' : label;
}

/** Conservative 12px axis-font budget; full output remains in the SVG title. */
function labelWidth(text: string): number {
  return Array.from(text).reduce((width, symbol) => {
    if (/[ilI1.,:;'|! ]/.test(symbol)) return width + 4;
    if (/[-/()[\]]/.test(symbol)) return width + 6;
    return width + (/[MW@#%&]/.test(symbol) || (symbol.codePointAt(0) ?? 0) > 127 ? 12 : 8);
  }, 0);
}

/** Fit a label to one anchor without moving its recorded UTC coordinate. */
function fitAxisLabel(
  tick: ChartTick & { readonly label: string },
  preferred: ChartAxisLabel['anchor'],
  plot: { readonly left: number; readonly right: number },
): ChartAxisLabel {
  const spaces = {
    start: plot.right - tick.position,
    middle: 2 * Math.min(tick.position - plot.left, plot.right - tick.position),
    end: tick.position - plot.left,
  };
  let anchor = preferred;
  let characters = 12;
  let text = compactLabel(tick.label, characters);
  if (labelWidth(text) > spaces[anchor]) {
    for (const alternative of ['start', 'middle', 'end'] as const) {
      if (spaces[alternative] > spaces[anchor]) anchor = alternative;
    }
  }
  while (labelWidth(text) > spaces[anchor] && characters > 1) {
    text = compactLabel(tick.label, --characters);
  }
  return { ...tick, text, width: labelWidth(text), anchor };
}

/** Select readable candidate labels using their real UTC positions and measured plot bounds. */
export function prepareXLabels(
  ticks: readonly ChartTick[],
  format: (value: number) => string,
  plot: { readonly left: number; readonly right: number },
): readonly ChartAxisLabel[] {
  if (plot.right - plot.left < 24) return [];
  const labels = ticks
    .map((tick) => ({ ...tick, label: format(tick.value) }))
    .filter(
      (tick, index, all) => all.findIndex((candidate) => candidate.label === tick.label) === index,
    );
  const first = labels[0];
  const last = labels.at(-1);
  if (!first) return [];
  if (!last || first === last) return [fitAxisLabel(first, 'middle', plot)];
  const firstLabel = fitAxisLabel(first, 'start', plot);
  const lastLabel = fitAxisLabel(last, 'end', plot);
  const gap = 8;
  const labelLeft = (tick: ChartAxisLabel) =>
    tick.position -
    (tick.anchor === 'middle' ? tick.width / 2 : tick.anchor === 'end' ? tick.width : 0);
  const lastLeft = labelLeft(lastLabel);
  let occupiedRight = labelLeft(firstLabel) + firstLabel.width;
  const selected: ChartAxisLabel[] = [firstLabel];
  if (occupiedRight + gap > lastLeft) return selected;
  for (const tick of labels.slice(1, -1)) {
    const label = fitAxisLabel(tick, 'middle', plot);
    const left = labelLeft(label);
    const right = left + label.width;
    if (left >= occupiedRight + gap && right + gap <= lastLeft) {
      selected.push(label);
      occupiedRight = right;
    }
  }
  selected.push(lastLabel);
  return selected;
}

export function resolveIdentities(
  previous: ChartIdentityState,
  series: readonly PharoChartSeries[],
  configuration: string,
): ChartIdentityState {
  const invalid = { ...previous, configuration, valid: false };
  if (!Array.isArray(series) || series.length > 3) return invalid;
  const active = new Map<string, PharoChartAppearance>();
  const occupied = new Set<PharoChartAppearance>();
  const ids = new Set<string>();
  for (const item of series) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) return invalid;
    ids.add(item.id);
    const retained = previous.active.get(item.id);
    if (item.appearance === undefined && retained) {
      active.set(item.id, retained);
      occupied.add(retained);
    }
  }
  for (const item of series) {
    if (item.appearance === undefined) continue;
    if (!appearanceOrder.includes(item.appearance) || occupied.has(item.appearance)) return invalid;
    active.set(item.id, item.appearance);
    occupied.add(item.appearance);
  }
  for (const item of series) {
    if (active.has(item.id)) continue;
    const historical = previous.history.get(item.id);
    const appearance =
      historical && !occupied.has(historical)
        ? historical
        : appearanceOrder.find((candidate) => !occupied.has(candidate));
    if (!appearance) return invalid;
    active.set(item.id, appearance);
    occupied.add(appearance);
  }
  const history = new Map(previous.history);
  for (const [id, appearance] of active) history.set(id, appearance);
  return { configuration, active, history, valid: true };
}
