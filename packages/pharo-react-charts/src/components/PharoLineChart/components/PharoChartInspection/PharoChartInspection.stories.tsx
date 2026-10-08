import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, within } from 'storybook/test';
import { PharoChartInspection } from './PharoChartInspection';
import type { PharoChartInspectionProps } from './types';

function ControlledInspection(props: PharoChartInspectionProps) {
  const [timestamp, setTimestamp] = useState(props.timestamp);

  return (
    <PharoChartInspection
      {...props}
      timestamp={timestamp}
      date={timestamp === 0 ? 'Jan 1' : 'Jan 2'}
      onInspect={setTimestamp}
    />
  );
}

const meta = {
  title: 'Charts/Private/PharoChartInspection',
  component: PharoChartInspection,
  render: (args) => <ControlledInspection {...args} />,
  args: {
    label: 'Exact measurements',
    timeline: [0, 86_400_000],
    timestamp: 86_400_000,
    date: 'Jan 2',
    valueText: 'Recorded UTC measurement',
    details: [{ id: 'sensor', label: 'Sensor', kind: 'available', value: 5, display: '5' }],
    onInspect: () => undefined,
  },
} satisfies Meta<typeof PharoChartInspection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RecordedDateSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = canvas.getByRole('slider', { name: 'Inspect Exact measurements' });

    await expect(slider).toHaveValue('1');
    await expect(canvas.getByText('Jan 2')).toBeVisible();

    await fireEvent.change(slider, { target: { value: '0' } });

    await expect(slider).toHaveValue('0');
    await expect(canvas.getByText('Jan 1')).toBeVisible();

    await fireEvent.change(slider, { target: { value: '1' } });

    await expect(slider).toHaveValue('1');
    await expect(canvas.getByText('Jan 2')).toBeVisible();
  },
};
