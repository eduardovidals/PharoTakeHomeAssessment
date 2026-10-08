import { PharoComboBox } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PharoComboBox as PharoComboBoxDocs } from './PharoComboBox';

interface Plant {
  id: string;
  name: string;
}

const plants: Plant[] = [
  { id: 'orchid', name: 'Orchid' },
  { id: 'fern', name: 'Fern' },
  { id: 'maple', name: 'Maple' },
];

const meta = {
  title: 'Components/PharoComboBox',
  // Source supplies docgen metadata; every story renders the built public export.
  component: PharoComboBoxDocs<Plant>,
  render: (args) => <PharoComboBox<Plant> {...args} />,
  args: {
    label: 'Plant',
    defaultItems: plants,
    itemKey: (plant) => plant.id,
    itemText: (plant) => plant.name,
    onSelectionChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PharoComboBox<Plant>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FilterAndSelect: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('combobox', { name: 'Plant' });

    await userEvent.type(input, 'Fer');

    const body = within(canvasElement.ownerDocument.body);

    await expect(await body.findByRole('option', { name: 'Fern' })).toBeVisible();

    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect(input).toHaveValue('Fern');
    await expect(args.onSelectionChange).toHaveBeenLastCalledWith('fern');
    await expect(body.queryByRole('listbox')).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { defaultItems: [], emptyMessage: 'No plants available.', onSelectionChange: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Show options Plant' }),
    );

    const body = within(canvasElement.ownerDocument.body);
    const placeholder = await body.findByText('No plants available.');

    await expect(placeholder).toBeVisible();

    await userEvent.click(placeholder);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect(args.onSelectionChange).not.toHaveBeenCalled();

    const input = within(canvasElement).getByRole('combobox');

    await expect(input).toHaveValue('');

    // Empty text is inert; begin the separate keyboard dismissal from the input.
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}');

    await expect(await body.findByText('No plants available.')).toBeVisible();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  },
};

export const Invalid: Story = {
  args: {
    isInvalid: true,
    description: 'Choose one plant.',
    errorMessage: 'Select an available plant.',
  },
};

export const Disabled: Story = { args: { isDisabled: true, defaultSelectedKey: 'fern' } };

export const ReadOnly: Story = { args: { isReadOnly: true, defaultSelectedKey: 'fern' } };

export const DisabledOption: Story = {
  args: { disabledKeys: ['fern'] },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Show options Plant' }),
    );

    const body = within(canvasElement.ownerDocument.body);

    await expect(await body.findByRole('option', { name: 'Fern' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await userEvent.keyboard('{Escape}');
  },
};

export const LongContent: Story = {
  args: {
    label: 'Plant variety for the shared indoor collection',
    defaultItems: [
      {
        id: 'long',
        name: 'A particularly long botanical variety name that should wrap comfortably',
      },
    ],
  },
};
