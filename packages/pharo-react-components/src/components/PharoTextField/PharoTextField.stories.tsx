import { PharoTextField } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PharoTextField as PharoTextFieldDocs } from './PharoTextField';

const meta = {
  title: 'Components/PharoTextField',
  // Source supplies docgen metadata; every story renders the built public export.
  component: PharoTextFieldDocs,
  render: (args) => <PharoTextField {...args} />,
  args: { label: 'Display name', onChange: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PharoTextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Display name' });

    await userEvent.type(input, 'Ada');

    await expect(input).toHaveValue('Ada');
    await expect(args.onChange).toHaveBeenLastCalledWith('Ada');
  },
};

export const WithHelp: Story = { args: { description: 'Shown next to your contributions.' } };

export const Invalid: Story = {
  args: {
    isInvalid: true,
    description: 'Use a name your team recognizes.',
    errorMessage: 'Enter a display name.',
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Display name' });

    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(/Enter a display name\./);
  },
};

export const Disabled: Story = { args: { isDisabled: true, defaultValue: 'Unavailable' } };

export const ReadOnly: Story = { args: { isReadOnly: true, defaultValue: 'Published name' } };

export const NativeHints: Story = {
  args: {
    label: 'Email address',
    inputProps: { autoComplete: 'email', inputMode: 'email', placeholder: 'name@example.test' },
  },
};

export const LongContent: Story = {
  args: {
    label: 'The full display name that appears on shared presentation materials',
    description:
      'A longer explanation remains associated with the input and wraps within the available width.',
    defaultValue: 'Alexandria Catherine Montgomery',
  },
};
