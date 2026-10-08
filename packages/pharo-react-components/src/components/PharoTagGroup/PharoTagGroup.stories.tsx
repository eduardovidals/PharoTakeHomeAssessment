import { useState } from 'react';
import { PharoTagGroup } from '@pharo/react-components';
import type { PharoTagGroupProps } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PharoTagGroup as PharoTagGroupDocs } from './PharoTagGroup';

function ControlledStory(props: PharoTagGroupProps) {
  const [items, setItems] = useState(props.items);
  return (
    <PharoTagGroup
      {...props}
      items={items}
      onRemove={
        props.onRemove
          ? async (keys) => {
              await props.onRemove?.(keys);
              setItems((current) => current.filter((item) => !keys.includes(item.id)));
            }
          : undefined
      }
    />
  );
}

const meta = {
  title: 'Components/PharoTagGroup',
  component: PharoTagGroupDocs,
  render: (args) => <ControlledStory {...args} />,
  args: {
    label: 'Selected categories',
    items: [
      { id: 'alpha', text: 'Alpha' },
      { id: 7, text: 'Seven' },
    ],
    onRemove: fn(),
  },
} satisfies Meta<typeof PharoTagGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Removable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Seven' }));
    await expect(args.onRemove).toHaveBeenCalledWith([7]);
    await expect(canvas.queryByText('Seven')).not.toBeInTheDocument();
    await expect(canvas.getByText('Alpha')).toBeVisible();
  },
};
export const ReadOnly: Story = { args: { onRemove: undefined } };
export const Disabled: Story = { args: { isDisabled: true } };
export const LongLabels: Story = {
  args: {
    items: [{ id: 'long', text: 'A long category label remains readable in a narrow collection' }],
  },
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
};
