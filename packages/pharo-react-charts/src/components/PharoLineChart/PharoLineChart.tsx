import { utcFormat } from 'd3-time-format';
import { useId, useState } from 'react';
import { useChartSize } from '../../hooks/useChartSize/useChartSize';
import { mergeClasses } from '../../styles/mergeClasses';
import { prepareChartGeometry } from './geometry';
import {
  axisLabelStyles,
  axisStyles,
  boundsStyles,
  containerStyles,
  dashPatterns,
  lineStyles,
  markerStyles,
  statusStyles,
  svgStyles,
} from './styles';
import type {
  ChartAxisLabel,
  ChartGeometry,
  ChartIdentityState,
  ChartTick,
  PharoChartAppearance,
  PharoChartSeries,
  PharoLineChartProps as Props,
} from './types';

const appearanceOrder: readonly PharoChartAppearance[] = ['primary', 'secondary', 'tertiary'];
const utcDate = utcFormat('%Y-%m-%d');

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  // Extended years retain their full date instead of the formatter's four digits.
  return year < 0 || year > 9999 ? (date.toISOString().split('T')[0] ?? '') : utcDate(date);
}

function formatNumber(value: number): string {
  return value.toString();
}

function identityConfiguration(series: readonly PharoChartSeries[]): string {
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

function compactLabel(label: string, characters: number): string {
  const symbols = Array.from(label);
  return symbols.length > characters ? symbols.slice(0, characters - 1).join('') + '…' : label;
}

function prepareXLabels(
  ticks: readonly ChartTick[],
  format: (value: number) => string,
): readonly ChartAxisLabel[] {
  const labels = ticks
    .map((tick) => {
      const label = format(tick.value);
      const text = compactLabel(label, 12);
      // Longer strings have an explicit SVG width; shorter glyphs get a
      // conservative font-size budget without measuring or squeezing the DOM.
      return { ...tick, label, text, width: text.length > 8 ? 76 : text.length * 12 };
    })
    .filter(
      (tick, index, all) => all.findIndex((candidate) => candidate.label === tick.label) === index,
    );
  const first = labels[0];
  const last = labels.at(-1);
  if (!first) return [];
  if (!last || first === last) return [first];
  const gap = 8;
  const lastLeft = last.position - last.width;
  let occupiedRight = first.position + first.width;
  if (occupiedRight + gap > lastLeft) return [first];
  const selected: ChartAxisLabel[] = [first];
  for (const label of labels.slice(1, -1)) {
    const left = label.position - label.width / 2;
    const right = label.position + label.width / 2;
    if (left >= occupiedRight + gap && right + gap <= lastLeft) {
      selected.push(label);
      occupiedRight = right;
    }
  }
  selected.push(last);
  return selected;
}

function resolveIdentities(
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

/**
 * Responsive React-owned SVG with shared UTC domains and explicit missing gaps.
 * Import `@pharo/tailwind-plugin` in the consumer's CSS entry for semantic styles.
 * @example
 * ```tsx
 * <PharoLineChart label="Temperature readings" yAxisLabel="Degrees"
 *   series={[{ id: 'room', label: 'Room', points: [
 *     { x: Date.UTC(2026, 0, 1), y: 18 },
 *     { x: Date.UTC(2026, 0, 2), y: 20 },
 *   ] }]} />
 * ```
 */
export function PharoLineChart(props: Props) {
  const {
    series,
    label,
    description,
    xAxisLabel,
    yAxisLabel,
    formatX = formatDate,
    formatY = formatNumber,
    className,
  } = props;
  const { ref, width, height } = useChartSize();
  const uniqueId = useId();
  const titleId = uniqueId + '-title';
  const descriptionId = uniqueId + '-description';
  const clipId = uniqueId + '-clip';
  const configuration = identityConfiguration(series);
  const [identityState, setIdentityState] = useState<ChartIdentityState>(() =>
    resolveIdentities(
      {
        configuration: '',
        active: new Map(),
        history: new Map(),
        valid: true,
      },
      series,
      configuration,
    ),
  );
  let identities = identityState;
  if (identityState.configuration !== configuration) {
    identities = resolveIdentities(identityState, series, configuration);
    setIdentityState(identities);
  }
  const prepared = prepareChartGeometry(series, width, height);
  const geometry: ChartGeometry =
    identities.valid || prepared.kind === 'invalid'
      ? prepared
      : {
          kind: 'invalid',
          reason: 'PHARO-CHART-DATA',
          message: 'Chart appearances conflict.',
        };
  const xLabels = geometry.kind === 'ready' ? prepareXLabels(geometry.xTicks, formatX) : [];

  return (
    <div
      ref={ref}
      className={mergeClasses(containerStyles, className)}
      data-chart-state={geometry.kind}
      data-chart-reason={'reason' in geometry ? geometry.reason : undefined}
    >
      {geometry.kind !== 'ready' ? (
        <p role="status" aria-label={label} className={statusStyles}>
          {geometry.message}
        </p>
      ) : (
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className={svgStyles}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width={geometry.width}
          height={geometry.height}
        >
          <title id={titleId}>{label}</title>
          {description ? <desc id={descriptionId}>{description}</desc> : null}
          <defs>
            <clipPath id={clipId}>
              <rect
                x={geometry.plot.left}
                y={geometry.plot.top}
                width={geometry.plot.right - geometry.plot.left}
                height={geometry.plot.bottom - geometry.plot.top}
              />
            </clipPath>
          </defs>
          <path
            className={boundsStyles}
            strokeWidth={1}
            d={`M${geometry.plot.left},${geometry.plot.top}V${geometry.plot.bottom}H${geometry.plot.right}`}
          />
          <g className={axisStyles} aria-label="UTC time axis">
            {xLabels.map((tick, index) => {
              const fullLabel = tick.label;
              const text = tick.text;
              return (
                <text
                  key={tick.value}
                  x={tick.position}
                  y={geometry.plot.bottom + 20}
                  textAnchor={
                    index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle'
                  }
                  textLength={text.length > 8 ? 76 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                >
                  <title>{fullLabel}</title>
                  {text}
                </text>
              );
            })}
          </g>
          <g className={axisStyles} aria-label="Value axis">
            {geometry.yTicks.map((tick) => {
              const fullLabel = formatY(tick.value);
              const text = compactLabel(fullLabel, 9);
              return (
                <text
                  key={tick.value}
                  x={geometry.plot.left - 8}
                  y={tick.position}
                  dy="0.35em"
                  textAnchor="end"
                  textLength={text.length > 6 ? 44 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                >
                  <title>{fullLabel}</title>
                  {text}
                </text>
              );
            })}
          </g>
          {yAxisLabel ? (
            <text
              className={axisLabelStyles}
              x={geometry.plot.left}
              y={12}
              textLength={
                yAxisLabel.length > 24 ? geometry.plot.right - geometry.plot.left : undefined
              }
              lengthAdjust="spacingAndGlyphs"
            >
              <title>{yAxisLabel}</title>
              {compactLabel(yAxisLabel, 36)}
            </text>
          ) : null}
          {xAxisLabel ? (
            <text
              className={axisLabelStyles}
              x={(geometry.plot.left + geometry.plot.right) / 2}
              y={geometry.height - 8}
              textAnchor="middle"
              textLength={
                xAxisLabel.length > 24 ? geometry.plot.right - geometry.plot.left : undefined
              }
              lengthAdjust="spacingAndGlyphs"
            >
              <title>{xAxisLabel}</title>
              {compactLabel(xAxisLabel, 36)}
            </text>
          ) : null}
          <g>
            {geometry.series.map((item) => {
              const appearance = identities.active.get(item.id);
              if (!appearance) return null;
              return (
                <g key={item.id} data-series-id={item.id} data-appearance={appearance}>
                  <title>{item.label}</title>
                  {item.path ? (
                    <path
                      d={item.path}
                      clipPath={`url(#${clipId})`}
                      className={lineStyles[appearance]}
                      strokeWidth={2}
                      strokeDasharray={dashPatterns[appearance]}
                    />
                  ) : null}
                  {item.markers.map((marker) => (
                    <circle
                      key={marker.point.x}
                      cx={marker.x}
                      cy={marker.y}
                      r={4}
                      className={markerStyles[appearance]}
                    />
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
