import { PharoChartDataTable, PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries, PharoLineChartProps } from '@pharo/react-charts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId, useState } from 'react';
import { expect, fireEvent, userEvent, within } from 'storybook/test';
import { PharoLineChart as PharoLineChartDocs } from './PharoLineChart';

const readings: readonly PharoChartSeries[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    points: [
      { x: Date.UTC(2024, 2, 10), y: -5 },
      { x: Date.UTC(2024, 2, 11), y: 0 },
      { x: Date.UTC(2024, 2, 12), y: 10 },
    ],
  },
];

const meta = {
  title: 'Charts/PharoLineChart',
  // Colocated source supplies genuine docgen; all canvases render the built public export.
  component: PharoLineChartDocs,
  render: (args) => <PharoLineChart {...args} />,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Compare up to three generic series with shared UTC and value axes. Supply readonly observations with integer UTC epoch-millisecond x values and finite number or null y values. IDs and labels are nonblank; series IDs and dates within each series are unique. The chart sorts copies, preserves the supplied dates and breaks the straight line at null observations. Negative values, flat values and isolated points are supported.\n\nEach active ID retains its color and dash when other series change. Pointer inspection, touch taps and the labeled native range select actual recorded dates; midpoint ties choose the earlier date. Missing or absent readings at that exact date are Unavailable. Arrow keys, Home and End navigate the range, and the disclosure exposes every recorded date in a table.\n\nImport the public theme CSS once and include installed chart classes in the consumer’s Tailwind sources. The default measured chart height is 320px; className targets that measured box. Legend, details and table sit outside it. Seven independent axis/detail/table/accessibility formatters change presentation without changing observations. Axis text stays compact while details and table retain full text. Caller formatter exceptions propagate. Empty and invalid input have chart-owned states; request loading and network failures belong to the consuming application.',
      },
    },
  },
  args: {
    series: readings,
    label: 'Temperature readings',
    description: 'Recorded daily temperatures, including readings below zero.',
    xAxisLabel: 'Date (UTC)',
    yAxisLabel: 'Temperature',
  },
  argTypes: {
    series: { control: 'object' },
    label: { control: 'text' },
    description: { control: 'text' },
    xAxisLabel: { control: 'text' },
    yAxisLabel: { control: 'text' },
    formatXDetail: { control: false },
    formatXTable: { control: false },
    formatXAccessible: { control: false },
    formatXAxis: { control: false },
    xTickValues: { control: 'object' },
    baselineY: { control: 'number' },
    formatYAxis: { control: false },
    formatYDetail: { control: false },
    formatYTable: { control: false },
    dataTable: { control: 'object' },
    formatX: { table: { disable: true } },
    formatY: { table: { disable: true } },
  },
  play: async ({ canvasElement, args }) => {
    const chart = await within(canvasElement).findByRole('img', { name: args.label });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAccessibleDescription(args.description);
  },
} satisfies Meta<typeof PharoLineChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: { description: { story: 'One series includes negative, zero and positive readings.' } },
  },
};

function ExternalExample(props: PharoLineChartProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-table`}
        className="min-h-pharo-control rounded-pharo-control border border-pharo-control-border px-pharo-3 focus-visible:pharo-focus-ring"
        onClick={() => setOpen((value) => !value)}
      >
        View external data
      </button>
      <PharoLineChart {...props} dataTable={{ mode: 'external', triggerId: id }} />
      <div id={`${id}-table`} hidden={!open}>
        {open ? (
          <PharoChartDataTable series={props.series} caption="External source records" />
        ) : null}
      </div>
    </div>
  );
}
export const ExternalData: Story = {
  render: (args) => <ExternalExample {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    const trigger = canvas.getByRole('button', { name: 'View external data' });
    await expect(chart).toHaveAttribute('aria-details', trigger.id);
    await expect(
      canvas.queryByRole('button', { name: `Show data table for ${args.label}` }),
    ).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await expect(canvas.getByRole('table', { name: 'External source records' })).toBeVisible();
    await expect(chart).toHaveAttribute('height', '320');
  },
};

const candidateDates = [10, 11, 13, 18, 21, 25].map((date) => Date.UTC(2024, 2, date));
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
export const RecordedCandidates: Story = {
  args: {
    label: 'Recorded candidate dates',
    description: 'March 10–25, 2024 (UTC). Only actual recording dates are axis candidates.',
    series: [
      {
        id: 'sensor',
        label: 'Sensor',
        points: candidateDates.map((x, index) => ({ x, y: index === 2 ? null : index * 2 })),
      },
    ],
    xTickValues: candidateDates,
    formatXAxis: (timestamp) => shortDate.format(timestamp),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    const axis = within(chart).getByLabelText('UTC time axis');
    const labels = [...axis.querySelectorAll('title')].map((title) => title.textContent);
    await expect(labels[0]).toBe('Mar 10');
    await expect(labels.at(-1)).toBe('Mar 25');
    await expect(axis.querySelector('[textLength]')).toBeNull();
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(within(table).getByRole('rowheader', { name: '2024-03-13' })).toBeVisible();
    await expect(within(table).getAllByRole('rowheader')).toHaveLength(candidateDates.length);
  },
};

export const ReferenceBaseline: Story = {
  args: {
    baselineY: 0,
    description: 'Recorded temperatures compared with a quiet zero-degree reference line.',
  },
  parameters: {
    docs: {
      description: {
        story:
          'A finite baseline uses the same numerical scale as the observations. It does not add a record or a filled area.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    await expect(chart.querySelector('[data-chart-baseline="0"]')).toBeVisible();
    await expect(
      canvas.getByRole('region', { name: `Details for ${args.label}` }),
    ).toHaveTextContent('10');
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    await expect(
      canvas.getByRole('table', { name: `Data for ${args.label}` }).querySelectorAll('tbody tr'),
    ).toHaveLength(3);
  },
};

export const ThreeSeries: Story = {
  args: {
    label: 'Three sensor readings',
    description: 'Three independent sensors share the same date and value axes.',
    series: [
      ...readings,
      {
        id: 'shade',
        label: 'Shade sensor',
        points: [
          { x: Date.UTC(2024, 2, 10), y: -10 },
          { x: Date.UTC(2024, 2, 12), y: 5 },
        ],
      },
      {
        id: 'sun',
        label: 'Sun sensor',
        points: [
          { x: Date.UTC(2024, 2, 10), y: 0 },
          { x: Date.UTC(2024, 2, 12), y: 15 },
        ],
      },
    ],
  },
};

export const MissingObservations: Story = {
  args: {
    description: 'Missing observations break the line; isolated readings remain visible.',
    series: [
      {
        id: 'temperature',
        label: 'Temperature',
        points: [
          { x: Date.UTC(2024, 2, 10), y: -5 },
          { x: Date.UTC(2024, 2, 11), y: null },
          { x: Date.UTC(2024, 2, 12), y: 10 },
        ],
      },
    ],
  },
};

export const OneObservation: Story = {
  args: {
    description: 'A single recorded observation is displayed as a marker.',
    series: [
      { id: 'temperature', label: 'Temperature', points: [{ x: Date.UTC(2024, 2, 10), y: 20 }] },
    ],
  },
};

export const FlatValues: Story = {
  args: {
    description: 'A flat series gets a finite padded axis without changing its values.',
    series: [
      {
        id: 'temperature',
        label: 'Temperature',
        points: [
          { x: Date.UTC(2024, 2, 10), y: 20 },
          { x: Date.UTC(2024, 2, 12), y: 20 },
        ],
      },
    ],
  },
};

export const Empty: Story = {
  args: { series: [] },
  parameters: {
    docs: {
      description: {
        story:
          'An empty array or all-null observations produce a named no-observations state, with no invented point or inspection control.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: args.label })).toHaveTextContent(
      'No observations to display.',
    );
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

export const InvalidData: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The repeated date makes this series invalid. Malformed input is reported deliberately rather than silently dropping or averaging records.',
      },
    },
  },
  args: {
    series: [
      {
        id: 'temperature',
        label: 'Temperature',
        points: [
          { x: Date.UTC(2024, 2, 10), y: 20 },
          { x: Date.UTC(2024, 2, 10), y: 21 },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: args.label })).toHaveTextContent(
      'Chart data is invalid.',
    );
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

const unequalDates: readonly PharoChartSeries[] = [
  {
    id: 'a',
    label: 'Sensor A',
    points: [
      { x: Date.UTC(2024, 2, 10), y: 2 },
      { x: Date.UTC(2024, 2, 11), y: null },
      { x: Date.UTC(2024, 2, 13), y: 8 },
    ],
  },
  {
    id: 'b',
    label: 'Sensor B',
    points: [
      { x: Date.UTC(2024, 2, 11), y: 20 },
      { x: Date.UTC(2024, 2, 12), y: 30 },
    ],
  },
];

export const UnequalDates: Story = {
  args: {
    label: 'Sensors with unequal recording dates',
    description:
      'Inspection selects a recorded date shared by the chart. A missing or absent reading stays unavailable.',
    series: unequalDates,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This two-series comparison has unequal recording calendars. Move over the plot or use the labeled range control. Native arrow keys, Home and End navigate the sorted union of recorded dates; midpoint ties choose the earlier date. Values are exact observations, never interpolation or a neighboring series date. The table exposes every recorded date without using a pointer.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    const bounds = chart.getBoundingClientRect();
    const width = Number(chart.getAttribute('width'));
    // Exercise the pointer handler at the recorded third date. Native range key
    // defaults and real touch gestures are verified by the public Playwright fixture.
    await userEvent.pointer({
      target: chart,
      coords: {
        clientX: bounds.left + ((56 + (width - 72) * (2 / 3)) / width) * bounds.width,
        clientY: bounds.top + 60,
      },
    });
    const details = canvas.getByRole('region', { name: `Details for ${args.label}` });
    await expect(details).toHaveTextContent('2024-03-12');
    await expect(details).toHaveTextContent('Sensor A');
    await expect(details).toHaveTextContent('Unavailable');
    await expect(details).toHaveTextContent('Sensor B');
    await expect(within(details).getByText('30', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('slider', { name: `Inspect ${args.label}` })).toHaveValue('2');
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(within(table).getAllByRole('rowheader')).toHaveLength(4);
    await expect(within(table).getByRole('rowheader', { name: '2024-03-11' })).toBeVisible();
  },
};

export const LongLabelsAndDataTable: Story = {
  args: {
    label: 'Long descriptions in a narrow comparison',
    description:
      'Full sensor names and recorded values remain readable below the measured chart and in its data table.',
    series: unequalDates.map((item) => ({
      ...item,
      label:
        item.id === 'a'
          ? 'Outdoor shaded temperature sensor beside the northern greenhouse entrance'
          : 'Indoor temperature sensor above the southern propagation workbench',
    })),
    formatYDetail: (value) => `${value} degrees Celsius recorded by the sensor`,
    formatYTable: (value) => `${value} degrees Celsius recorded by the sensor`,
  },
  render: (args) => (
    <div className="w-full max-w-sm">
      <PharoLineChart {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Legend and observation details wrap in normal document flow. The disclosure provides full, unshortened values; its table scrolls within its own container. Opening it does not change the measured chart height. API loading and request failures remain the consuming application’s responsibility.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    const height = chart.getAttribute('height');
    await expect(canvas.getByRole('list', { name: `Legend for ${args.label}` })).toHaveTextContent(
      'Outdoor shaded temperature sensor beside the northern greenhouse entrance',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(
      within(table).getByRole('columnheader', {
        name: 'Indoor temperature sensor above the southern propagation workbench',
      }),
    ).toBeVisible();
    await expect(
      within(table).getByRole('cell', { name: '30 degrees Celsius recorded by the sensor' }),
    ).toBeVisible();
    await expect(chart).toHaveAttribute('height', height ?? '');
    await userEvent.click(
      canvas.getByRole('button', { name: `Hide data table for ${args.label}` }),
    );
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument();
  },
};

export const NarrowContainer: Story = {
  args: {
    label: 'Measurements in a compact space',
    description: 'A 256px-wide chart retains inspection and a complete data table.',
    series: unequalDates,
  },
  render: (args) => (
    <div className="w-64 max-w-full">
      <PharoLineChart {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The surrounding layout gives the chart 256px of width. Axis labels reduce to a readable subset, while observation details and the full table preserve every recorded date. Opening the table leaves the measured chart height unchanged.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByRole('img', { name: args.label });
    await expect(chart).toHaveAttribute('width', '256');
    await expect(chart).toHaveAttribute('height', '320');
    await expect(canvas.getByRole('slider', { name: `Inspect ${args.label}` })).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(
      within(table)
        .getAllByRole('rowheader')
        .map((row) => row.textContent),
    ).toEqual(['2024-03-10', '2024-03-11', '2024-03-12', '2024-03-13']);
    await expect(within(table).getByRole('cell', { name: /^30$/ })).toBeVisible();
    await expect(chart).toHaveAttribute('height', '320');
  },
};

export const CustomFormatting: Story = {
  args: {
    label: 'Measurements with full unit descriptions',
    description: 'Consumer formatting supplies explicit UTC date text and measurement units.',
    formatXDetail: (value) =>
      `Recorded on ${new Date(value).toISOString().slice(0, 10)} at midnight UTC`,
    formatXTable: (value) =>
      `Recorded on ${new Date(value).toISOString().slice(0, 10)} at midnight UTC`,
    formatXAccessible: (value) =>
      `Recorded on ${new Date(value).toISOString().slice(0, 10)} at midnight UTC`,
    formatYDetail: (value) => `${value.toString()} degrees Celsius from the laboratory record`,
    formatYTable: (value) => `${value.toString()} degrees Celsius from the laboratory record`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Both formatters receive numbers: UTC epoch milliseconds for x and the recorded value for y. Full output stays in details and the table, even when an axis compacts it. Formatting does not round the stored observations or imply a currency.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('img', { name: args.label });
    const details = canvas.getByRole('region', { name: `Details for ${args.label}` });
    await expect(
      within(details).getByText('Recorded on 2024-03-12 at midnight UTC', { exact: true }),
    ).toBeVisible();
    await expect(
      within(details).getByText('10 degrees Celsius from the laboratory record', { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(
      within(table).getByRole('rowheader', { name: 'Recorded on 2024-03-12 at midnight UTC' }),
    ).toBeVisible();
    await expect(
      within(table).getByRole('cell', { name: '10 degrees Celsius from the laboratory record' }),
    ).toBeVisible();
    await expect(table).not.toHaveTextContent('…');
  },
};

const originalReadings: readonly PharoChartSeries[] = Object.freeze([
  Object.freeze({
    id: 'room',
    label: 'Room sensor',
    points: Object.freeze([
      Object.freeze({ x: Date.UTC(2024, 2, 10), y: 12 }),
      Object.freeze({ x: Date.UTC(2024, 2, 12), y: 14 }),
    ]),
  }),
  Object.freeze({
    id: 'reference',
    label: 'Reference sensor',
    points: Object.freeze([
      Object.freeze({ x: Date.UTC(2024, 2, 10), y: 8 }),
      Object.freeze({ x: Date.UTC(2024, 2, 12), y: 10 }),
    ]),
  }),
]);

const replacementReadings: readonly PharoChartSeries[] = Object.freeze(
  originalReadings.map((item) =>
    item.id === 'room'
      ? Object.freeze({
          ...item,
          points: Object.freeze([
            Object.freeze({ x: Date.UTC(2024, 2, 10), y: 18 }),
            Object.freeze({ x: Date.UTC(2024, 2, 12), y: 21 }),
          ]),
        })
      : item,
  ),
);

/** Chart arguments shared with one isolated, consumer-owned update example. */
interface UpdatedObservationsExampleProps {
  /** Current public chart arguments from this story instance. */
  readonly chartProps: PharoLineChartProps;
}

function UpdatedObservationsExample(props: UpdatedObservationsExampleProps) {
  const { chartProps } = props;
  const [replaced, setReplaced] = useState(false);
  return (
    <div className="space-y-pharo-4">
      <button
        type="button"
        aria-pressed={replaced}
        className="min-h-pharo-control rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-4 py-pharo-2 focus-visible:pharo-focus-ring"
        onClick={() => setReplaced((current) => !current)}
      >
        {replaced ? 'Restore original observations' : 'Replace observations'}
      </button>
      <PharoLineChart {...chartProps} series={replaced ? replacementReadings : chartProps.series} />
    </div>
  );
}

export const UpdatedObservations: Story = {
  args: {
    label: 'Updated room measurements',
    description:
      'Replacing observations keeps the series identities and the reference sensor intact.',
    series: originalReadings,
  },
  argTypes: { series: { control: false } },
  render: (args) => <UpdatedObservationsExample chartProps={args} />,
  parameters: {
    docs: {
      description: {
        story:
          'A consumer-owned control replaces one series with new immutable observations while preserving its ID and the other series. The current recorded date and full table update together. Restoring the original array restores the original readings; no global store or app provider is involved.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('img', { name: args.label });
    const details = canvas.getByRole('region', { name: `Details for ${args.label}` });
    const legend = canvas.getByRole('list', { name: `Legend for ${args.label}` });
    await expect(within(details).getByText('14', { exact: true })).toBeVisible();
    await expect(within(details).getByText('10', { exact: true })).toBeVisible();
    const slider = canvas.getByRole('slider', { name: `Inspect ${args.label}` });
    await fireEvent.change(slider, { target: { value: '0' } });
    await expect(slider).toHaveValue('0');
    await expect(within(details).getByText('12', { exact: true })).toBeVisible();
    await expect(within(details).getByText('8', { exact: true })).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: `Show data table for ${args.label}` }),
    );
    const table = canvas.getByRole('table', { name: `Data for ${args.label}` });
    await expect(within(table).getByRole('cell', { name: /^14$/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Replace observations' }));
    await expect(within(details).getByText('18', { exact: true })).toBeVisible();
    await expect(within(table).getByRole('cell', { name: /^21$/ })).toBeVisible();
    await expect(within(table).queryByRole('cell', { name: /^14$/ })).not.toBeInTheDocument();
    await expect(within(legend).getByText('Reference sensor', { exact: true })).toBeVisible();
    await expect(within(details).getByText('8', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Restore original observations' }));
    await expect(within(details).getByText('12', { exact: true })).toBeVisible();
    await expect(within(table).getByRole('cell', { name: /^14$/ })).toBeVisible();
    await expect(within(table).queryByRole('cell', { name: /^21$/ })).not.toBeInTheDocument();
  },
};
