import { useState } from 'react';
import { PharoButton, PharoDialog, type PharoDialogProps } from '@pharo/react-components';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PharoDialog as PharoDialogDocs } from './PharoDialog';

function DialogExample(props: PharoDialogProps) {
  const [isOpen, setIsOpen] = useState(props.isOpen);

  return (
    <PharoDialog
      {...props}
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        props.onOpenChange(open);
      }}
    />
  );
}

const meta = {
  title: 'Components/PharoDialog',
  component: PharoDialogDocs,
  render: (args) => <DialogExample {...args} />,
  args: {
    triggerId: 'story-details',
    triggerLabel: 'View details',
    title: 'Collection details',
    isOpen: false,
    onOpenChange: fn(),
    children: (
      <>
        <p>Content and actions belong to the consumer.</p>
        <PharoButton variant="secondary">Content action</PharoButton>
      </>
    ),
  },
} satisfies Meta<typeof PharoDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const KeyboardAndDismissal: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'View details' });

    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Collection details' });

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus(),
    );

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const LongContent: Story = {
  args: {
    children: (
      <div className="space-y-pharo-4">
        {Array.from({ length: 35 }, (_, index) => (
          <p key={index}>
            Row {index + 1}: long consumer content stays inside the modal while Close remains
            available.
          </p>
        ))}
        <PharoButton variant="secondary">Last content action</PharoButton>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Resize to a narrow or short viewport: the modal becomes a full-height tray and its content scrolls below the fixed header.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'View details' }));

    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'Collection details',
    });

    await expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  },
};

export const DisabledTrigger: Story = {
  args: { triggerDisabled: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'View details' }),
    ).toBeDisabled();
  },
};
