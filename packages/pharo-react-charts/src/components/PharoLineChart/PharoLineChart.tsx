import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useChartSize } from '../../hooks/useChartSize/useChartSize';
import { mergeClasses } from '../../styles/mergeClasses';
import {
  createInspectionTimeline,
  inspectTimestamp,
  prepareChartRecords,
  formatDate,
  formatAxisDate,
  formatNumber,
} from '../../utils/chartData';
import { PharoChartDataTable } from '../PharoChartDataTable';
import { PharoChartAxes } from './components/PharoChartAxes';
import { PharoChartInspection } from './components/PharoChartInspection';
import { useExternalDataTrigger } from './hooks/useExternalDataTrigger';
import { prepareChartGeometry } from './geometry';
import { identityConfiguration, prepareXLabels, resolveIdentities } from './utils';
import { findNearestTimestamp } from './inspection';
import {
  baselineStyles,
  containerStyles,
  crosshairStyles,
  dashPatterns,
  disclosureStyles,
  figureStyles,
  labelStyles,
  legendItemStyles,
  legendSampleStyles,
  legendStyles,
  lineStyles,
  markerStyles,
  statusStyles,
  svgStyles,
} from './styles';
import type {
  ChartGeometry,
  ChartIdentityState,
  ChartInspectionDetail,
  ChartTouchGesture,
  PharoLineChartProps as Props,
} from './types';

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
    formatXAxis,
    formatXDetail = formatDate,
    formatXTable = formatDate,
    formatXAccessible = formatDate,
    xTickValues,
    baselineY,
    formatYAxis = formatNumber,
    formatYDetail = formatNumber,
    formatYTable = formatNumber,
    dataTable,
    className,
  } = props;
  const { ref, width, height } = useChartSize();
  const [figure, setFigure] = useState<HTMLElement | null>(null);
  const externalTrigger = useExternalDataTrigger({
    owner: figure,
    triggerId:
      dataTable?.mode === 'external' && typeof dataTable.triggerId === 'string'
        ? dataTable.triggerId
        : undefined,
  });
  const uniqueId = useId();
  const titleId = uniqueId + '-title';
  const descriptionId = uniqueId + '-description';
  const clipId = uniqueId + '-clip';
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
  const prepared = prepareChartGeometry(series, width, height, xTickValues, baselineY);
  const geometry: ChartGeometry =
    identities.valid || prepared.kind === 'invalid'
      ? prepared
      : {
          kind: 'invalid',
          reason: 'PHARO-CHART-DATA',
          message: 'Chart appearances conflict.',
        };
  const records = prepareChartRecords(series);
  const timeline = records.kind === 'ready' ? createInspectionTimeline(records.series) : [];
  const includeYear =
    geometry.kind === 'ready' &&
    new Date(geometry.xDomain[0]).getUTCFullYear() !==
      new Date(geometry.xDomain[1]).getUTCFullYear();
  const axisDate = formatXAxis ?? ((timestamp: number) => formatAxisDate(timestamp, includeYear));
  const xLabels =
    geometry.kind === 'ready' ? prepareXLabels(geometry.xTicks, axisDate, geometry.plot) : [];
  let inspectedTimestamp: number | undefined;
  if (geometry.kind === 'ready') {
    inspectedTimestamp = findNearestTimestamp(
      timeline,
      selectedTimestamp ?? timeline.at(-1) ?? NaN,
    );
    // Only an explicit user choice becomes state; later async records keep the implicit latest fresh.
    if (selectedTimestamp !== undefined && inspectedTimestamp !== selectedTimestamp)
      setSelectedTimestamp(inspectedTimestamp);
  } else if (geometry.kind !== 'unmeasured' && selectedTimestamp !== undefined) {
    setSelectedTimestamp(undefined);
  }
  const details: readonly ChartInspectionDetail[] =
    geometry.kind === 'ready' && inspectedTimestamp !== undefined
      ? inspectTimestamp(geometry.series, inspectedTimestamp).map((row) => ({
          ...row,
          display: row.kind === 'available' ? formatYDetail(row.value) : 'Unavailable',
        }))
      : [];
  const selectedDate = inspectedTimestamp !== undefined ? formatXDetail(inspectedTimestamp) : '';
  const valueText =
    (inspectedTimestamp !== undefined ? formatXAccessible(inspectedTimestamp) : '') +
    '; ' +
    details.map((row) => row.label + ': ' + row.display).join('; ');
  const crosshairX =
    geometry.kind === 'ready' && inspectedTimestamp !== undefined
      ? geometry.plot.left +
        ((inspectedTimestamp - geometry.xDomain[0]) / (geometry.xDomain[1] - geometry.xDomain[0])) *
          (geometry.plot.right - geometry.plot.left)
      : undefined;

  const inspectPointer = (event: PointerEvent<SVGSVGElement>) => {
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
  };

  const beginPointer = (event: PointerEvent<SVGSVGElement>) => {
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

  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
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

  const completePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    const gesture = touchGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    touchGesture.current = null;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.moved && Number.isFinite(distance) && distance <= 8) inspectPointer(event);
  };

  return (
    <figure ref={setFigure} className={figureStyles}>
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
            aria-details={externalTrigger}
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
            <PharoChartAxes
              geometry={geometry}
              xLabels={xLabels}
              formatYAxis={formatYAxis}
              xAxisLabel={xAxisLabel}
              yAxisLabel={yAxisLabel}
            />
            {geometry.baseline ? (
              <line
                aria-hidden="true"
                data-chart-baseline={geometry.baseline.value}
                x1={geometry.plot.left}
                x2={geometry.plot.right}
                y1={geometry.baseline.position}
                y2={geometry.baseline.position}
                className={baselineStyles}
                strokeWidth={1}
              />
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
        <PharoChartInspection
          label={label}
          timeline={timeline}
          timestamp={inspectedTimestamp}
          date={selectedDate}
          valueText={valueText}
          details={details}
          onInspect={setSelectedTimestamp}
        />
      ) : null}
      {records.kind === 'ready' && timeline.length > 0 && !externalTrigger ? (
        <>
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
          <div id={tableId} hidden={!tableOpen}>
            {tableOpen ? (
              <PharoChartDataTable
                series={records.series}
                caption={`Data for ${label}`}
                formatXTable={formatXTable}
                formatXAccessible={formatXAccessible}
                formatYTable={formatYTable}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </figure>
  );
}
