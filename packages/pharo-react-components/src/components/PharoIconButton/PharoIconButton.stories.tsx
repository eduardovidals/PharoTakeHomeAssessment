import { PharoIconButton } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PharoIconButton as PharoIconButtonDocs } from './PharoIconButton';

const closeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" focusable="false">
    <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

const meta = {
  title: 'Components/PharoIconButton',
  // Source supplies docgen metadata; every story renders the built public export.
  component: PharoIconButtonDocs,
  render: (args) => <PharoIconButton {...args} />,
  args: { 'aria-label': 'Close observations', icon: closeIcon, onPress: fn() },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'quiet'] },
    icon: { control: false },
  },
} satisfies Meta<typeof PharoIconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Close observations' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onPress).toHaveBeenCalledTimes(1);
    await expect(button).toHaveFocus();
  },
};
export const Primary: Story = { args: { variant: 'primary' } };
export const Quiet: Story = { args: { variant: 'quiet' } };
export const Disabled: Story = {
  args: { isDisabled: true, onPress: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Close observations' });
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
export const Pending: Story = {
  args: { isPending: true, onPress: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Close observations' });
    await userEvent.click(button);
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
