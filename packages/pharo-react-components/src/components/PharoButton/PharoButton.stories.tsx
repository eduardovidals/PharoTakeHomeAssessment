import { PharoButton } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PharoButton as PharoButtonDocs } from './PharoButton';

const meta = {
  title: 'Components/PharoButton',
  // Source supplies docgen metadata; every story renders the built public export.
  component: PharoButtonDocs,
  render: (args) => <PharoButton {...args} />,
  args: { children: 'Save changes', onPress: fn() },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'quiet'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof PharoButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Save changes' });

    button.focus();
    await userEvent.keyboard('{Enter}');

    await expect(args.onPress).toHaveBeenCalledTimes(1);
    await expect(button).toHaveFocus();
  },
};

export const Secondary: Story = { args: { variant: 'secondary' } };

export const Quiet: Story = { args: { variant: 'quiet' } };

export const Small: Story = { args: { size: 'sm' } };

export const Disabled: Story = {
  args: { isDisabled: true, onPress: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Save changes' });

    await userEvent.click(button);

    await expect(button).toBeDisabled();
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

export const Pending: Story = { args: { isPending: true, children: 'Saving changes' } };

export const LongLabel: Story = {
  args: { children: 'Save the complete set of presentation preferences' },
  decorators: [
    (Story) => (
      <div className="max-w-72">
        <Story />
      </div>
    ),
  ],
};
