import { compactAxisLabel } from '../../utils';
import { styles } from './styles';
import type { PharoChartAxesProps as Props } from './types';

/**
 * Render shared axis geometry with complete titles and unsqueezed visible text.
 * @example
 * ```tsx
 * <svg><PharoChartAxes geometry={geometry} xLabels={labels} formatYAxis={String} /></svg>
 * ```
 */
export function PharoChartAxes(props: Props) {
  const { geometry, xLabels, formatYAxis, xAxisLabel, yAxisLabel } = props;
  const fontScale = geometry.axisFontSize / 12;
  return (
    <g fontSize={geometry.axisFontSize}>
      <path
        className={styles.bounds}
        strokeWidth={1}
        d={`M${geometry.plot.left},${geometry.plot.top}V${geometry.plot.bottom}H${geometry.plot.right}`}
      />
      <g className={styles.axis} role="group" aria-label="UTC time axis">
        {xLabels.map((tick) => (
          <text
            key={tick.value}
            x={tick.position}
            y={geometry.plot.bottom + 20 * fontScale}
            textAnchor={tick.anchor}
          >
            <title>{tick.label}</title>
            {tick.text}
          </text>
        ))}
      </g>
      <g className={styles.axis} role="group" aria-label="Value axis">
        {geometry.yTicks.map((tick) => {
          const label = formatYAxis(tick.value);
          return (
            <text
              key={tick.value}
              x={geometry.plot.left - 8 * fontScale}
              y={tick.position}
              dy="0.35em"
              textAnchor="end"
            >
              <title>{label}</title>
              {compactAxisLabel(label, geometry.plot.left - 16 * fontScale, geometry.axisFontSize)}
            </text>
          );
        })}
      </g>
      {yAxisLabel ? (
        <text className={styles.label} x={geometry.plot.left} y={12 * fontScale}>
          <title>{yAxisLabel}</title>
          {compactAxisLabel(
            yAxisLabel,
            geometry.plot.right - geometry.plot.left,
            geometry.axisFontSize,
          )}
        </text>
      ) : null}
      {xAxisLabel ? (
        <text
          className={styles.label}
          x={(geometry.plot.left + geometry.plot.right) / 2}
          y={geometry.height - 8 * fontScale}
          textAnchor="middle"
        >
          <title>{xAxisLabel}</title>
          {compactAxisLabel(
            xAxisLabel,
            geometry.plot.right - geometry.plot.left,
            geometry.axisFontSize,
          )}
        </text>
      ) : null}
    </g>
  );
}
