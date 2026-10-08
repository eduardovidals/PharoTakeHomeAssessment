import { useState } from 'react';
import { PharoButton } from '@pharo/react-components';
import {
  PharoFormTextField,
  useSchemaForm,
  type PharoFormTextFieldProps,
} from '@pharo/react-form-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { PharoFormTextField as PharoFormTextFieldDocs } from './PharoFormTextField';

type Values = { name: string };

type StoryArgs = Pick<
  PharoFormTextFieldProps<Values>,
  'label' | 'description' | 'isDisabled' | 'isReadOnly' | 'inputProps'
>;

const meta = {
  title: 'Forms/PharoFormTextField',
  // Source supplies docgen metadata; the live form renders built public exports.
  component: PharoFormTextFieldDocs<Values>,
  args: { name: 'name', label: 'Display name', description: 'Shown with your contributions.' },
  render: function BoundTextField(args) {
    const form = useSchemaForm(
      z.object({ name: z.string().min(2, 'Enter at least two characters.') }),
      {
        defaultValues: { name: args.isDisabled || args.isReadOnly ? 'Ada' : '' },
      },
    );
    const [submitted, setSubmitted] = useState('Not submitted');

    return (
      <form
        noValidate
        className="max-w-sm space-y-pharo-4"
        onSubmit={form.handleSubmit((value) =>
          setSubmitted(`Submitted: ${value.name ?? 'omitted'}`),
        )}
      >
        <PharoFormTextField {...args} name="name" control={form.control} />
        <PharoButton type="submit">Submit name</PharoButton>
        <p role="status">{submitted}</p>
      </form>
    );
  },
  argTypes: {
    control: { control: false },
    name: { control: false },
    isDisabled: { control: 'boolean' },
    isReadOnly: { control: 'boolean' },
    // Optional-never keys are ownership exclusions, not configurable public inputs.
    ref: { control: false, table: { disable: true } },
    value: { control: false, table: { disable: true } },
    defaultValue: { control: false, table: { disable: true } },
    onChange: { control: false, table: { disable: true } },
    onBlur: { control: false, table: { disable: true } },
    inputRef: { control: false, table: { disable: true } },
    isInvalid: { control: false, table: { disable: true } },
    errorMessage: { control: false, table: { disable: true } },
    validate: { control: false, table: { disable: true } },
    validationBehavior: { control: false, table: { disable: true } },
  },
} satisfies Meta<typeof PharoFormTextField<Values>>;

export default meta;

type Story = StoryObj<StoryArgs>;

export const KeyboardSubmit: Story = {
  args: { label: 'Display name' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox', { name: 'Display name' }), 'Grace{Enter}');

    await expect(await canvas.findByText('Submitted: Grace')).toBeVisible();
  },
};

export const ValidationError: Story = {
  args: { label: 'Display name' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Submit name' }));

    await expect(await canvas.findByText('Enter at least two characters.')).toBeVisible();

    const input = canvas.getByRole('textbox', { name: 'Display name' });

    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveAccessibleDescription(/Enter at least two characters\./);
  },
};

export const Disabled: Story = {
  args: { label: 'Display name', isDisabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('textbox', { name: 'Display name' })).toBeDisabled();

    await userEvent.click(canvas.getByRole('button', { name: 'Submit name' }));

    await expect(await canvas.findByText('Submitted: omitted')).toBeVisible();
  },
};

export const ReadOnly: Story = { args: { label: 'Published name', isReadOnly: true } };

export const LongContent: Story = {
  args: {
    label: 'The full display name shown on your shared presentation materials',
    description:
      'This longer explanation wraps naturally while staying associated with the form-controlled input.',
  },
};
