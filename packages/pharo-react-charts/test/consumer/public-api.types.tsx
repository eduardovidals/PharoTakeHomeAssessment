import { PharoLineChart } from '@pharo/react-charts';
import type {
  PharoChartPoint,
  PharoChartSeries,
  PharoChartAppearance,
  PharoLineChartProps,
} from '@pharo/react-charts';

const point: PharoChartPoint = { x: Date.UTC(2024, 2, 10), y: -12 };
const points: readonly PharoChartPoint[] = Object.freeze([
  point,
  { x: Date.UTC(2024, 2, 11), y: null },
]);
const appearance: PharoChartAppearance = 'secondary';
const series: readonly PharoChartSeries[] = Object.freeze([
  { id: 'temperature', label: 'Temperature', points, appearance },
]);

export function TypedConsumer() {
  const props: PharoLineChartProps = {
    label: 'Daily temperature observations',
    description: 'Missing measurements are explicit gaps.',
    series,
    xAxisLabel: 'UTC date',
    yAxisLabel: 'Degrees',
    formatX: (timestamp) => new Date(timestamp).toISOString().slice(0, 10),
    formatY: (value) => value.toFixed(1),
    className: 'max-w-4xl',
  };
  return <PharoLineChart {...props} />;
}

export function RejectedConsumerContracts() {
  const immutablePoint: PharoChartPoint = { x: 0, y: null };
  const immutablePoints: readonly PharoChartPoint[] = [immutablePoint];
  // @ts-expect-error Recorded coordinates remain readonly at the public boundary.
  immutablePoint.x = 0;
  // @ts-expect-error Consumer arrays remain readonly at the public boundary.
  immutablePoints.push({ x: 0, y: 0 });
  const datePoint: PharoChartPoint = {
    // @ts-expect-error UTC epoch milliseconds exclude mutable Date values.
    x: new Date(),
    y: 1,
  };
  const stringPoint: PharoChartPoint = {
    // @ts-expect-error Parsing date strings belongs to the consumer adapter.
    x: '2024-03-10',
    y: 1,
  };
  const missingPoint: PharoChartPoint = {
    x: 0,
    // @ts-expect-error Missing observations are explicit null, never undefined.
    y: undefined,
  };
  const invalidAppearance: PharoChartSeries = {
    id: 'invalid',
    label: 'Invalid',
    points: [datePoint, stringPoint, missingPoint],
    // @ts-expect-error Presentation is a finite semantic contract, not arbitrary CSS colors.
    appearance: 'red',
  };
  return (
    <>
      {/* @ts-expect-error Every chart requires an accessible label. */}
      <PharoLineChart series={series} />
      <PharoLineChart
        label="Invalid formatter"
        series={series}
        // @ts-expect-error A formatter returns presentation text.
        formatY={(value) => value}
      />
      <PharoLineChart
        label="No application state dependency"
        series={[invalidAppearance]}
        // @ts-expect-error Query and application state are not chart props.
        queryClient={{}}
      />
    </>
  );
}
