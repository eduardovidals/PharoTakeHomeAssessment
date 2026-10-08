import { PharoChartDataTable, PharoLineChart } from '@pharo/react-charts';
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
    formatXDetail: (timestamp) => new Date(timestamp).toISOString().slice(0, 10),
    formatXAxis: (timestamp) => new Date(timestamp).toISOString().slice(5, 10),
    xTickValues: Object.freeze([point.x]),
    formatYDetail: (value) => value.toFixed(1),
    className: 'max-w-4xl',
  };
  return (
    <>
      <PharoLineChart {...props} dataTable={{ mode: 'external', triggerId: 'consumer-data' }} />
      <button id="consumer-data" type="button">
        View recorded data
      </button>
      <PharoChartDataTable
        series={series}
        caption="Recorded observations"
        formatXTable={(value) => String(value)}
        formatXAccessible={(value) => `Full recorded timestamp ${value}`}
        formatYTable={String}
      />
    </>
  );
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
  const legacy = {
    label: 'Legacy forwarded object',
    series,
    formatX: (value: number) => String(value),
  };
  return (
    <>
      {/* @ts-expect-error Deprecated aliases cannot be forwarded through a wider object. */}
      <PharoLineChart {...legacy} />
      <PharoLineChart
        series={series}
        label="Missing association"
        // @ts-expect-error An external alternative requires an explicit real trigger ID.
        dataTable={{ mode: 'external' }}
      />
      {/* @ts-expect-error Data access cannot be hidden entirely. */}
      <PharoLineChart series={series} label="Hidden alternative" dataTable={{ mode: 'none' }} />
      {/* @ts-expect-error Every chart requires an accessible label. */}
      <PharoLineChart series={series} />
      <PharoLineChart
        label="Invalid formatter"
        series={series}
        // @ts-expect-error A formatter returns presentation text.
        formatYAxis={(value) => value}
      />
      <PharoLineChart
        label="Invalid candidate dates"
        series={series}
        // @ts-expect-error Tick candidates use UTC epoch milliseconds, not Date objects.
        xTickValues={[new Date()]}
      />
      <PharoLineChart
        label="Invalid short formatter"
        series={series}
        // @ts-expect-error Axis formatters return presentation text independently from detail formatting.
        formatXAxis={(value) => value}
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
