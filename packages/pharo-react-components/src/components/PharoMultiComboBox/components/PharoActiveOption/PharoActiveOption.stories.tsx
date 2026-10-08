import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PharoMultiComboBox } from '@pharo/react-components';
import { PharoActiveOption } from './PharoActiveOption';

const meta = {
  title: 'Components/PharoMultiComboBox/Native active option',
  component: PharoActiveOption,
  args: { query: '' },
  render: () => (
    <PharoMultiComboBox
      label="Example values"
      items={[
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
      ]}
      itemKey={(item) => item.id}
      itemText={(item) => item.name}
      selectedKeys={[]}
      selectedText={String}
      inputValue=""
      onInputChange={() => undefined}
      onSelectionAction={() => 'unchanged'}
    />
  ),
} satisfies Meta<typeof PharoActiveOption>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NativeArrowNavigation: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('combobox');
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(input);

    const first = await body.findByRole('option', { name: 'First' });

    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', first.id));

    await userEvent.keyboard('{ArrowDown}');

    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      body.getByRole('option', { name: 'Second' }).id,
    );

    await userEvent.keyboard('{Escape}');
  },
};
