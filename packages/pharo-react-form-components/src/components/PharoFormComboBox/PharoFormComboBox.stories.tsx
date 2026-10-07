import { useState } from 'react';
import { PharoButton } from '@pharo/react-components';
import {
  PharoFormComboBox,
  useSchemaForm,
  type PharoFormComboBoxProps,
} from '@pharo/react-form-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { PharoFormComboBox as PharoFormComboBoxDocs } from './PharoFormComboBox';

interface Plant {
  id: string;
  name: string;
}
type Values = { plant: string };
const plants: Plant[] = [
  { id: 'orchid', name: 'Orchid' },
  { id: 'fern', name: 'Fern' },
];
type StoryArgs = Pick<
  PharoFormComboBoxProps<Values, Plant>,
  'label' | 'description' | 'isDisabled' | 'isReadOnly' | 'defaultItems' | 'emptyMessage'
>;
const meta = {
  title: 'Forms/PharoFormComboBox',
  // Source supplies docgen metadata; the live form renders built public exports.
  component: PharoFormComboBoxDocs<Values, Plant>,
  args: {
    name: 'plant',
    label: 'Plant',
    defaultItems: plants,
    itemKey: (item) => item.id,
    itemText: (item) => item.name,
    description: 'Choose one plant for the collection.',
  },
  render: function BoundComboBox(args) {
    const form = useSchemaForm(
      z.object({
        plant: z
          .string()
          .min(1, 'Select a plant.')
          .transform((value) => value.toUpperCase()),
      }),
      {
        defaultValues: { plant: args.isDisabled || args.isReadOnly ? 'fern' : '' },
      },
    );
    const [submitted, setSubmitted] = useState('Not submitted');
    return (
      <form
        noValidate
        className="max-w-sm space-y-pharo-4"
        onSubmit={form.handleSubmit((value) =>
          setSubmitted(`Submitted: ${value.plant ?? 'omitted'}`),
        )}
      >
        <PharoFormComboBox {...args} name="plant" control={form.control} />
        <PharoButton type="submit">Add plant</PharoButton>
        <p role="status">{submitted}</p>
      </form>
    );
  },
  argTypes: {
    control: { control: false },
    name: { control: false },
    itemKey: { control: false },
    itemText: { control: false },
    defaultItems: { control: false },
    isDisabled: { control: 'boolean' },
    isReadOnly: { control: 'boolean' },
    // Optional-never keys are ownership exclusions, not configurable public inputs.
    ref: { control: false, table: { disable: true } },
    value: { control: false, table: { disable: true } },
    defaultValue: { control: false, table: { disable: true } },
    onChange: { control: false, table: { disable: true } },
    selectedKey: { control: false, table: { disable: true } },
    defaultSelectedKey: { control: false, table: { disable: true } },
    onSelectionChange: { control: false, table: { disable: true } },
    inputValue: { control: false, table: { disable: true } },
    defaultInputValue: { control: false, table: { disable: true } },
    onInputChange: { control: false, table: { disable: true } },
    onBlur: { control: false, table: { disable: true } },
    inputRef: { control: false, table: { disable: true } },
    isInvalid: { control: false, table: { disable: true } },
    errorMessage: { control: false, table: { disable: true } },
    validate: { control: false, table: { disable: true } },
    validationBehavior: { control: false, table: { disable: true } },
    allowsCustomValue: { control: false, table: { disable: true } },
    formValue: { control: false, table: { disable: true } },
    selectionMode: { control: false, table: { disable: true } },
  },
} satisfies Meta<typeof PharoFormComboBox<Values, Plant>>;
export default meta;
type Story = StoryObj<StoryArgs>;

export const SelectAndSubmit: Story = {
  args: { label: 'Plant' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: 'Plant' });
    await userEvent.type(input, 'Fer');
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole('option', { name: 'Fern' }),
    ).toBeVisible();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(input).toHaveValue('Fern');
    await userEvent.click(canvas.getByRole('button', { name: 'Add plant' }));
    await expect(await canvas.findByText('Submitted: FERN')).toBeVisible();
  },
};
export const ValidationError: Story = {
  args: { label: 'Plant' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add plant' }));
    await expect(await canvas.findByText('Select a plant.')).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('combobox', { name: 'Plant' })).toHaveFocus());
  },
};
export const Empty: Story = {
  args: { label: 'Plant', defaultItems: [], emptyMessage: 'No plants available.' },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('combobox', { name: 'Plant' });
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}');
    await expect(
      await within(canvasElement.ownerDocument.body).findByText('No plants available.'),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(input).toHaveFocus();
  },
};
export const Disabled: Story = { args: { label: 'Plant', isDisabled: true } };
export const ReadOnly: Story = { args: { label: 'Published plant', isReadOnly: true } };
export const LongContent: Story = {
  args: {
    label: 'The plant variety for your shared indoor collection',
    defaultItems: [
      {
        id: 'long',
        name: 'A particularly long botanical variety name that wraps inside the available width',
      },
    ],
  },
};
