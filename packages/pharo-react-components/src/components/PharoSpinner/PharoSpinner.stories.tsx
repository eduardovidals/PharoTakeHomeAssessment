import { PharoSpinner } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { PharoSpinner as PharoSpinnerDocs } from './PharoSpinner';

const meta = {
  title: 'Components/PharoSpinner',
  // Source supplies docgen metadata; every story renders the built public export.
  component: PharoSpinnerDocs,
  render: (args) => <PharoSpinner {...args} />,
  args: { label: 'Loading' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    // Optional-never keys enforce ownership; they are not configurable public props.
    children: { control: false, table: { disable: true } },
    isIndeterminate: { control: false, table: { disable: true } },
    value: { control: false, table: { disable: true } },
    minValue: { control: false, table: { disable: true } },
    maxValue: { control: false, table: { disable: true } },
    valueLabel: { control: false, table: { disable: true } },
    'aria-label': { control: false, table: { disable: true } },
    'aria-labelledby': { control: false, table: { disable: true } },
  },
} satisfies Meta<typeof PharoSpinner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const progress = within(canvasElement).getByRole('progressbar', { name: 'Loading' });
    await expect(progress).toBeVisible();
    await expect(progress).not.toHaveAttribute('aria-valuenow');
  },
};
export const Small: Story = { args: { size: 'sm' } };
export const Updating: Story = { args: { label: 'Updating your preferences' } };
export const LongLabel: Story = {
  args: { label: 'Loading the complete collection of presentation preferences' },
};
