import { PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries } from '@pharo/react-charts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
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
    formatX: { control: false },
    formatY: { control: false },
  },
  play: async ({ canvasElement, args }) => {
    const chart = await within(canvasElement).findByRole('img', { name: args.label });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAccessibleDescription(args.description);
  },
} satisfies Meta<typeof PharoLineChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status', { name: args.label })).toHaveTextContent(
      'No observations to display.',
    );
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

export const InvalidData: Story = {
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
          'Move over the plot or use the labeled range control. Native arrow keys, Home and End navigate the sorted union of recorded dates; midpoint ties choose the earlier date. Values are exact observations, never interpolation or a neighboring series date. The table exposes every recorded date without using a pointer.',
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
    formatY: (value) => `${value} degrees Celsius recorded by the sensor`,
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
