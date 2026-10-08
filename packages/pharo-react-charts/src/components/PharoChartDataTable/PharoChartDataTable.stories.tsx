import { PharoChartDataTable } from '@pharo/react-charts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { PharoChartDataTable as PharoChartDataTableDocs } from './PharoChartDataTable';

const meta = {
  title: 'Charts/PharoChartDataTable',
  component: PharoChartDataTableDocs,
  render: (args) => <PharoChartDataTable {...args} />,
  tags: ['autodocs'],
  args: {
    caption: 'Recorded measurements',
    series: [
      {
        id: 'sensor-a',
        label: 'Sensor A',
        points: [
          { x: Date.UTC(2026, 5, 23), y: 1.23456789 },
          { x: Date.UTC(2026, 5, 25), y: null },
        ],
      },
      {
        id: 'sensor-b',
        label: 'Sensor B',
        points: [
          { x: Date.UTC(2026, 5, 24), y: -3 },
          { x: Date.UTC(2026, 5, 25), y: 0 },
        ],
      },
      { id: 'unknown', label: 'Unknown sensor', points: [] },
    ],
  },
  argTypes: {
    formatXTable: { control: false },
    formatXAccessible: { control: false },
    formatYTable: { control: false },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole('table', { name: args.caption });

    await expect(table).toBeVisible();
    await expect(canvas.getByRole('region', { name: args.caption })).toHaveAttribute(
      'tabindex',
      '0',
    );
    await expect(within(table).getAllByRole('columnheader')).toHaveLength(args.series.length + 1);
  },
} satisfies Meta<typeof PharoChartDataTableDocs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RecordedRows: Story = {
  play: async (context) => {
    await meta.play(context);

    await expect(within(context.canvasElement).getAllByRole('rowheader')).toHaveLength(3);
    await expect(
      within(context.canvasElement).getByRole('cell', { name: '1.23456789' }),
    ).toBeVisible();
  },
};

export const MissingObservations: Story = {
  args: {
    series: [
      { id: 'sensor-a', label: 'Sensor A', points: [{ x: Date.UTC(2026, 5, 23), y: null }] },
    ],
  },
  play: async (context) => {
    await meta.play(context);

    await expect(
      within(context.canvasElement).getByRole('cell', { name: 'Unavailable' }),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { series: [] },
  play: async (context) => {
    await meta.play(context);

    await expect(
      within(context.canvasElement).getByText('No recorded observations.'),
    ).toBeVisible();
  },
};

export const LongLabels: Story = {
  args: {
    series: [
      {
        id: 'long',
        label: 'A complete long measurement name preserved across narrow and wide table layouts',
        points: [{ x: Date.UTC(2026, 5, 23), y: 12345.67 }],
      },
    ],
  },
};
