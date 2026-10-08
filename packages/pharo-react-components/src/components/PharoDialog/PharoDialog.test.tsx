import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mergeClasses } from '../../styles/mergeClasses';
import { PharoDialog } from './PharoDialog';

interface ControlledDialogProps {
  readonly onChange: (open: boolean) => void;
}

function ControlledDialog(props: ControlledDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <PharoDialog
      triggerId="details-trigger"
      triggerLabel="View details"
      title="Collection details"
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        props.onChange(open);
      }}
    >
      <p>Content owned by the consumer.</p>
      <button type="button">Content action</button>
    </PharoDialog>
  );
}

describe('PharoDialog', () => {
  it('opens a named dialog and restores the real trigger after Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDialog onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'View details' });
    expect(trigger).toHaveAttribute('id', 'details-trigger');
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Collection details' });
    expect(within(dialog).getByText('Content owned by the consumer.')).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('lets the visible close action update controlled open state', async () => {
    const user = userEvent.setup();
    render(<ControlledDialog onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open a disabled trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <PharoDialog
        triggerId="unavailable-details"
        triggerLabel="Unavailable details"
        title="Details"
        isOpen={false}
        onOpenChange={onOpenChange}
        triggerDisabled
      >
        Content
      </PharoDialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Unavailable details' });
    await user.click(trigger);
    expect(trigger).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('merges consumer sizing overrides while preserving unrelated responsive classes', () => {
    expect(
      mergeClasses(
        'sm:max-w-pharo-dialog max-h-pharo-plot-desktop p-pharo-dialog-inset',
        'sm:max-w-pharo-matrix max-h-pharo-plot-mobile p-pharo-6',
      ),
    ).toBe('sm:max-w-pharo-matrix max-h-pharo-plot-mobile p-pharo-6');
    expect(
      mergeClasses(
        'max-w-pharo-workspace h-pharo-header',
        'max-w-pharo-dialog h-pharo-chart-height',
      ),
    ).toBe('max-w-pharo-dialog h-pharo-chart-height');
  });
});
