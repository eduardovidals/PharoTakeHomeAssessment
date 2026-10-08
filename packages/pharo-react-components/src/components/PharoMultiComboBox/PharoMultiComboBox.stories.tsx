import { useState } from 'react';
import { PharoMultiComboBox } from '@pharo/react-components';
import type { PharoMultiComboBoxProps, PharoSelectionAction } from '@pharo/react-components';
import type { Key } from 'react-aria-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PharoMultiComboBox as Source } from './PharoMultiComboBox';

interface Plant {
  readonly id: number;
  readonly name: string;
}
const plants: readonly Plant[] = [
  { id: 7, name: 'Fern' },
  { id: 8, name: 'Maple' },
  { id: 9, name: 'Orchid' },
  { id: 10, name: 'A particularly long botanical variety whose complete name remains readable' },
];
const emptyKeys: readonly Key[] = [];
function ControlledPicker(props: PharoMultiComboBoxProps<Plant>) {
  const [keys, setKeys] = useState(props.selectedKeys);
  const [query, setQuery] = useState(props.inputValue);
  const handleAction = (action: PharoSelectionAction) => {
    setKeys((previous) =>
      action.kind === 'add'
        ? [...previous, action.key]
        : action.kind === 'clear'
          ? []
          : previous.filter((key) => !action.keys.includes(key)),
    );
    return 'committed' as const;
  };
  return (
    <PharoMultiComboBox
      {...props}
      selectedKeys={keys}
      inputValue={query}
      items={props.items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))}
      onInputChange={setQuery}
      onSelectionAction={handleAction}
    />
  );
}
const meta = {
  title: 'Components/PharoMultiComboBox',
  component: Source<Plant>,
  render: (args) => <ControlledPicker {...args} />,
  args: {
    label: 'Plants',
    items: plants,
    selectedKeys: emptyKeys,
    inputValue: '',
    itemKey: (item: Plant) => item.id,
    itemText: (item: Plant) => item.name,
    selectedText: (key: Key) => plants.find((plant) => plant.id === key)?.name ?? `Unknown ${key}`,
    onInputChange: () => undefined,
    onSelectionAction: () => 'unchanged',
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PharoMultiComboBox<Plant>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FilterAndSelect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole('combobox', { name: 'Plants' });
    await userEvent.type(input, 'Ma');
    const option = await body.findByRole('option', { name: 'Maple' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', option.id));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await expect(await canvas.findByRole('button', { name: 'Remove Maple' })).toBeVisible();
    await expect(input).toHaveValue('');
    await userEvent.keyboard('{Escape}');
  },
};
export const Multiple: Story = { args: { selectedKeys: [7, 8, 'unlisted'] } };
export const Limit: Story = {
  args: { selectedKeys: [7, 8], maxSelected: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox'));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole('option', { name: 'Orchid' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Fern' }));
    await expect(canvas.queryByRole('button', { name: 'Remove Fern' })).not.toBeInTheDocument();
  },
};
export const LongContent: Story = { args: { selectedKeys: [10] } };
export const Disabled: Story = { args: { selectedKeys: [7], isDisabled: true } };
export const ReadOnly: Story = { args: { selectedKeys: [7], isReadOnly: true } };
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText('No options found.')).toBeVisible();
    await expect(body.queryAllByRole('option', { selected: false })).toHaveLength(0);
    await userEvent.click(body.getByText('No options found.'));
    await userEvent.type(within(canvasElement).getByRole('combobox'), 'No match');
    await userEvent.keyboard('{Enter}');
    await expect(within(canvasElement).getByRole('combobox')).toHaveValue('No match');
    await expect(
      within(canvasElement).queryByRole('button', { name: /Remove/ }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
};
export const Pending: Story = {
  args: { items: [], selectedKeys: ['retired'], isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole('combobox');
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading options…');
    await expect(input).toHaveAttribute('aria-busy', 'true');
    await expect(input).not.toHaveAccessibleDescription(/Loading options/);
    await userEvent.click(input);
    const list = await body.findByRole('listbox');
    await expect(within(list).getByRole('status')).toHaveTextContent('Loading options…');
    await expect(body.getAllByRole('status')).toHaveLength(1);
    await expect(body.queryAllByRole('progressbar')).toHaveLength(0);
    await expect(body.getAllByRole('progressbar', { hidden: true })).toHaveLength(2);
    await expect(body.queryAllByRole('option', { selected: false })).toHaveLength(0);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(input).not.toHaveAttribute('aria-activedescendant');
    await userEvent.keyboard('{Escape}');
    await expect(input).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Remove Unknown retired' })).toBeVisible();
    await expect(body.getAllByRole('status')).toHaveLength(1);
  },
};
export const Failed: Story = {
  args: {
    items: [],
    selectedKeys: [7],
    isInvalid: true,
    errorMessage: 'Collection unavailable. Try again.',
  },
};
