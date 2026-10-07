import { utcFormat } from 'd3-time-format';
import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useChartSize } from '../../hooks/useChartSize/useChartSize';
import { mergeClasses } from '../../styles/mergeClasses';
import { prepareChartGeometry } from './geometry';
import { createInspectionTimeline, findNearestTimestamp, inspectTimestamp } from './inspection';
import {
  axisLabelStyles,
  axisStyles,
  boundsStyles,
  containerStyles,
  captionStyles,
  crosshairStyles,
  dashPatterns,
  dateHeaderStyles,
  dateStyles,
  detailItemStyles,
  detailLabelStyles,
  detailListStyles,
  detailsStyles,
  detailValueStyles,
  disclosureStyles,
  figureStyles,
  helpStyles,
  inspectionLabelStyles,
  inspectionStyles,
  labelStyles,
  legendItemStyles,
  legendSampleStyles,
  legendStyles,
  lineStyles,
  markerStyles,
  statusStyles,
  svgStyles,
  rangeStyles,
  tableCellStyles,
  tableDateStyles,
  tableHeaderStyles,
  tableRegionStyles,
  tableStyles,
} from './styles';
import type {
  ChartAxisLabel,
  ChartGeometry,
  ChartIdentityState,
  ChartInspectionDetail,
  ChartTick,
  ChartTouchGesture,
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
 * Inspect recorded dates with the native range control, a pointer or a touch tap;
 * the readable details and full table never substitute interpolated observations.
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
  const inspectionId = uniqueId + '-inspection';
  const instructionId = uniqueId + '-instructions';
  const tableId = uniqueId + '-table';
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | undefined>();
  const [tableOpen, setTableOpen] = useState(false);
  const touchGesture = useRef<ChartTouchGesture | null>(null);
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
  const timeline = geometry.kind === 'ready' ? createInspectionTimeline(geometry.series) : [];
  let inspectedTimestamp = selectedTimestamp;
  if (geometry.kind === 'ready') {
    inspectedTimestamp = findNearestTimestamp(timeline, selectedTimestamp ?? timeline[0] ?? NaN);
    if (inspectedTimestamp !== selectedTimestamp) setSelectedTimestamp(inspectedTimestamp);
  } else if (geometry.kind !== 'unmeasured' && selectedTimestamp !== undefined) {
    inspectedTimestamp = undefined;
    setSelectedTimestamp(undefined);
  }
  const details: readonly ChartInspectionDetail[] =
    geometry.kind === 'ready' && inspectedTimestamp !== undefined
      ? inspectTimestamp(geometry.series, inspectedTimestamp).map((row) => ({
          ...row,
          display: row.kind === 'available' ? formatY(row.value) : 'Unavailable',
        }))
      : [];
  const selectedDate =
    inspectedTimestamp !== undefined && geometry.kind === 'ready'
      ? formatX(inspectedTimestamp)
      : '';
  const selectedIndex =
    inspectedTimestamp === undefined ? -1 : timeline.indexOf(inspectedTimestamp);
  const valueText =
    selectedDate + '; ' + details.map((row) => row.label + ': ' + row.display).join('; ');
  const crosshairX =
    geometry.kind === 'ready' && inspectedTimestamp !== undefined
      ? geometry.plot.left +
        ((inspectedTimestamp - geometry.xDomain[0]) / (geometry.xDomain[1] - geometry.xDomain[0])) *
          (geometry.plot.right - geometry.plot.left)
      : undefined;

  function inspectPointer(event: PointerEvent<SVGSVGElement>) {
    if (geometry.kind !== 'ready' || !Number.isFinite(event.clientX)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.width) || bounds.width <= 0)
      return;
    const proportion = (event.clientX - bounds.left) / bounds.width;
    if (!Number.isFinite(proportion)) return;
    const svgX = Math.max(0, Math.min(1, proportion)) * geometry.width;
    const plotProportion = Math.max(
      0,
      Math.min(1, (svgX - geometry.plot.left) / (geometry.plot.right - geometry.plot.left)),
    );
    const candidate =
      (1 - plotProportion) * geometry.xDomain[0] + plotProportion * geometry.xDomain[1];
    const nearest = findNearestTimestamp(timeline, candidate);
    if (nearest !== undefined) setSelectedTimestamp(nearest);
  }

  function beginPointer(event: PointerEvent<SVGSVGElement>) {
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
  }

  function movePointer(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'touch') {
      inspectPointer(event);
      return;
    }
    const gesture = touchGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!Number.isFinite(distance) || distance > 8)
      touchGesture.current = { ...gesture, moved: true };
  }

  function completePointer(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'touch') return;
    const gesture = touchGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    touchGesture.current = null;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.moved && Number.isFinite(distance) && distance <= 8) inspectPointer(event);
  }

  return (
    <figure className={figureStyles}>
      {geometry.kind === 'ready' ? (
        <ul aria-label={`Legend for ${label}`} className={legendStyles}>
          {geometry.series.map((item) => {
            const appearance = identities.active.get(item.id);
            if (!appearance) return null;
            return (
              <li key={item.id} className={legendItemStyles}>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  className={legendSampleStyles}
                  width={32}
                  height={12}
                  viewBox="0 0 32 12"
                >
                  <path
                    d="M0,6H32"
                    className={lineStyles[appearance]}
                    strokeWidth={2}
                    strokeDasharray={dashPatterns[appearance]}
                  />
                </svg>
                <span className={labelStyles}>{item.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
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
            onPointerDown={beginPointer}
            onPointerMove={movePointer}
            onPointerUp={completePointer}
            onPointerCancel={(event) => {
              if (touchGesture.current?.pointerId === event.pointerId) touchGesture.current = null;
            }}
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
            {crosshairX !== undefined && Number.isFinite(crosshairX) ? (
              <g aria-hidden="true">
                <line
                  x1={crosshairX}
                  x2={crosshairX}
                  y1={geometry.plot.top}
                  y2={geometry.plot.bottom}
                  className={crosshairStyles}
                  strokeWidth={1}
                  strokeDasharray={dashPatterns.tertiary}
                />
              </g>
            ) : null}
          </svg>
        )}
      </div>
      {geometry.kind === 'ready' && inspectedTimestamp !== undefined ? (
        <>
          {timeline.length > 1 ? (
            <div className={inspectionStyles}>
              <label htmlFor={inspectionId} className={inspectionLabelStyles}>
                Inspect {label}
              </label>
              <input
                id={inspectionId}
                type="range"
                min={0}
                max={timeline.length - 1}
                step={1}
                value={selectedIndex}
                aria-valuetext={valueText}
                aria-describedby={instructionId}
                className={rangeStyles}
                onChange={(event) => {
                  const index = Number(event.currentTarget.value);
                  const timestamp = Number.isInteger(index) ? timeline[index] : undefined;
                  if (timestamp !== undefined) setSelectedTimestamp(timestamp);
                }}
              />
              <p id={instructionId} className={helpStyles}>
                Drag the slider or use arrow keys, Home and End to inspect recorded dates. Tab moves
                to the next control.
              </p>
            </div>
          ) : null}
          <section aria-label={`Details for ${label}`} className={detailsStyles}>
            <h3 className={dateStyles}>
              <time dateTime={new Date(inspectedTimestamp).toISOString()}>{selectedDate}</time>
            </h3>
            <dl className={detailListStyles}>
              {details.map((row) => (
                <div key={row.id} className={detailItemStyles}>
                  <dt className={detailLabelStyles}>{row.label}</dt>
                  <dd className={detailValueStyles}>{row.display}</dd>
                </div>
              ))}
            </dl>
          </section>
          <button
            type="button"
            className={disclosureStyles}
            aria-expanded={tableOpen}
            aria-controls={tableId}
            aria-label={`${tableOpen ? 'Hide' : 'Show'} data table for ${label}`}
            onClick={() => setTableOpen((open) => !open)}
          >
            {tableOpen ? 'Hide data table' : 'Show data table'}
          </button>
          <div
            id={tableId}
            role="region"
            aria-label={`Data table for ${label}`}
            // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- The named overflow region needs keyboard focus to scroll the full table.
            tabIndex={0}
            hidden={!tableOpen}
            className={tableRegionStyles}
          >
            {tableOpen ? (
              <table className={tableStyles}>
                <caption className={captionStyles}>Data for {label}</caption>
                <thead>
                  <tr>
                    <th scope="col" className={dateHeaderStyles}>
                      Date (UTC)
                    </th>
                    {geometry.series.map((item) => (
                      <th key={item.id} scope="col" className={tableHeaderStyles}>
                        {item.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((timestamp) => (
                    <tr key={timestamp}>
                      <th scope="row" className={tableDateStyles}>
                        <time dateTime={new Date(timestamp).toISOString()}>
                          {formatX(timestamp)}
                        </time>
                      </th>
                      {inspectTimestamp(geometry.series, timestamp).map((row) => (
                        <td key={row.id} className={tableCellStyles}>
                          {row.kind === 'available' ? formatY(row.value) : 'Unavailable'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </>
      ) : null}
    </figure>
  );
}
