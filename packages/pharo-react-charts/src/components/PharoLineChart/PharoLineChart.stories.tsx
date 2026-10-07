import { PharoLineChart } from '@pharo/react-charts';
import type { PharoChartSeries } from '@pharo/react-charts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
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
