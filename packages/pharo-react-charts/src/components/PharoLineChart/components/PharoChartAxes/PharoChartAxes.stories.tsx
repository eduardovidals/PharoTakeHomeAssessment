import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { prepareChartGeometry } from '../../geometry';
import { prepareXLabels } from '../../utils';
import { PharoChartAxes } from './PharoChartAxes';

const geometry = prepareChartGeometry(
  [
    {
      id: 'sensor',
      label: 'Sensor',
      points: [
        { x: 0, y: 10 },
        { x: 86_400_000, y: 20 },
      ],
    },
  ],
  600,
  240,
  [0, 86_400_000],
);
if (geometry.kind !== 'ready') throw new Error('Axis story needs usable geometry.');
const meta = {
  title: 'Charts/Private/PharoChartAxes',
  component: PharoChartAxes,
  args: {
    geometry,
    xLabels: prepareXLabels(
      geometry.xTicks,
      (value) => (value === 0 ? 'Jan 1' : 'Jan 2'),
      geometry.plot,
    ),
    formatYAxis: String,
  },
  render: (args) => (
    <svg role="img" aria-label="Prepared axes" width="600" height="240" viewBox="0 0 600 240">
      <PharoChartAxes {...args} />
    </svg>
  ),
} satisfies Meta<typeof PharoChartAxes>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PreparedAxes: Story = {
  play: async ({ canvasElement }) => {
    const svg = within(canvasElement).getByRole('img', { name: 'Prepared axes' });
    await expect(svg).toBeVisible();
    await expect(within(svg).getByLabelText('UTC time axis')).toHaveTextContent('Jan 1');
    await expect(svg.querySelector('[textLength]')).toBeNull();
  },
};
