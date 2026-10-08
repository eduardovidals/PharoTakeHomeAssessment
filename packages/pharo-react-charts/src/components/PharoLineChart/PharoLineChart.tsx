import { useId, useState } from 'react';
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
import { useChartInspection } from './hooks/useChartInspection';
import { prepareChartGeometry } from './geometry';
import { identityConfiguration, prepareXLabels, resolveIdentities } from './utils';
import {
  baselineStyles,
  containerStyles,
  crosshairStyles,
  dashPatterns,
  disclosureStyles,
  figureStyles,
  inspectionMarkerStyles,
  inspectionMotionStyles,
  inspectionOverlayStyles,
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
    selectedTimestamp,
    onTimestampChange,
    onTimestampPreview,
    className,
  } = props;

  const { ref, width, height, fontSize } = useChartSize();

  const externalTrigger =
    dataTable?.mode === 'external' &&
    typeof dataTable.triggerId === 'string' &&
    dataTable.triggerId.trim()
      ? dataTable.triggerId
      : undefined;

  const uniqueId = useId();
  const titleId = uniqueId + '-title';
  const descriptionId = uniqueId + '-description';
  const clipId = uniqueId + '-clip';
  const tableId = uniqueId + '-table';

  const [tableOpen, setTableOpen] = useState(false);

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

  const prepared = prepareChartGeometry(series, width, height, xTickValues, baselineY, fontSize);
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
    geometry.kind === 'ready'
      ? prepareXLabels(geometry.xTicks, axisDate, geometry.plot, fontSize)
      : [];

  const {
    timestamp: inspectedTimestamp,
    navigationTimestamp,
    onInspect,
    onNavigationFocus,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  } = useChartInspection({
    geometry,
    timeline,
    selectedTimestamp,
    onTimestampChange,
    onTimestampPreview,
  });

  const details: readonly ChartInspectionDetail[] =
    geometry.kind === 'ready' && inspectedTimestamp !== undefined
      ? inspectTimestamp(geometry.series, inspectedTimestamp).map((row) => ({
          ...row,
          display: row.kind === 'available' ? formatYDetail(row.value) : 'Unavailable',
        }))
      : [];
  const selectedDate = inspectedTimestamp !== undefined ? formatXDetail(inspectedTimestamp) : '';
  const valueText =
    (navigationTimestamp !== undefined ? formatXAccessible(navigationTimestamp) : '') +
    '; ' +
    (geometry.kind === 'ready' && navigationTimestamp !== undefined
      ? inspectTimestamp(geometry.series, navigationTimestamp).map(
          (row) =>
            row.label +
            ': ' +
            (row.kind === 'available' ? formatYDetail(row.value) : 'Unavailable'),
        )
      : []
    ).join('; ');

  const crosshairX =
    geometry.kind === 'ready' &&
    inspectedTimestamp !== undefined &&
    inspectedTimestamp >= geometry.xDomain[0] &&
    inspectedTimestamp <= geometry.xDomain[1]
      ? geometry.plot.left +
        ((inspectedTimestamp - geometry.xDomain[0]) / (geometry.xDomain[1] - geometry.xDomain[0])) *
          (geometry.plot.right - geometry.plot.left)
      : undefined;

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
            aria-details={externalTrigger}
            className={svgStyles}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            width={geometry.width}
            height={geometry.height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
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
              <g
                aria-hidden="true"
                data-chart-inspection=""
                transform={`translate(${crosshairX} 0)`}
                className={inspectionOverlayStyles}
              >
                <line
                  x1={0}
                  x2={0}
                  y1={geometry.plot.top}
                  y2={geometry.plot.bottom}
                  className={crosshairStyles}
                  strokeWidth={1}
                  strokeDasharray={dashPatterns.tertiary}
                />
                {details.map((row) => {
                  const appearance = identities.active.get(row.id);

                  if (row.kind !== 'available' || !appearance) return null;

                  const y =
                    geometry.plot.bottom -
                    ((row.value - geometry.yDomain[0]) /
                      (geometry.yDomain[1] - geometry.yDomain[0])) *
                      (geometry.plot.bottom - geometry.plot.top);

                  return (
                    <g
                      key={row.id}
                      data-inspection-series-id={row.id}
                      transform={`translate(0 ${y})`}
                      className={inspectionMotionStyles}
                    >
                      <circle
                        r={5}
                        strokeWidth={2}
                        className={mergeClasses(markerStyles[appearance], inspectionMarkerStyles)}
                      />
                    </g>
                  );
                })}
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
          navigationTimestamp={navigationTimestamp}
          onNavigationFocus={onNavigationFocus}
          date={selectedDate}
          valueText={valueText}
          details={details}
          onInspect={onInspect}
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
