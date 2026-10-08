import { useState } from 'react';
import { PharoSegmentedControl } from '@pharo/react-components';
import type { PharoSegmentedControlProps } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PharoSegmentedControl as PharoSegmentedControlDocs } from './PharoSegmentedControl';

function ControlledStory(props: PharoSegmentedControlProps<string>) {
  const [value, setValue] = useState(props.value);

  const handleChange = (next: string) => {
    setValue(next);
    props.onChange(next);
  };

  return <PharoSegmentedControl {...props} value={value} onChange={handleChange} />;
}

const meta = {
  title: 'Components/PharoSegmentedControl',
  component: PharoSegmentedControlDocs,
  render: (args) => <ControlledStory {...args} />,
  args: {
    label: 'Presentation',
    options: [
      { value: 'summary', label: 'Summary' },
      { value: 'unavailable', label: 'Unavailable', isDisabled: true },
      { value: 'detail', label: 'Detail' },
    ],
    value: 'summary',
    onChange: fn(),
  },
} satisfies Meta<typeof PharoSegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const KeyboardChoice: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole('radio', { name: 'Summary' });

    summary.focus();
    await userEvent.keyboard('{ArrowRight}');

    await expect(canvas.getByRole('radio', { name: 'Detail' })).toBeChecked();
    await expect(summary).not.toBeChecked();
    await expect(args.onChange).toHaveBeenCalledWith('detail');
  },
};

export const Disabled: Story = {
  args: { isDisabled: true, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const detail = within(canvasElement).getByRole('radio', { name: 'Detail' });

    await userEvent.click(detail);

    await expect(detail).toBeDisabled();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const LongLabels: Story = {
  args: {
    options: [
      { value: 'summary', label: 'A compact summary of the available information' },
      { value: 'detail', label: 'The complete supporting details' },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
};
