import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PharoTagGroup } from './PharoTagGroup';
import type { PharoTagItem } from './types';

const initial: readonly PharoTagItem[] = [
  { id: 'alpha', text: 'Alpha' },
  { id: 7, text: 'Seven' },
  { id: 'unknown', text: 'Unknown choice' },
];

function ControlledTags() {
  const [items, setItems] = useState(initial);
  return (
    <PharoTagGroup
      label="Selected categories"
      items={items}
      onRemove={(keys) => setItems((current) => current.filter((item) => !keys.includes(item.id)))}
    />
  );
}

describe('PharoTagGroup', () => {
  test('keeps unknown controlled labels and emits correctly typed removal keys', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<PharoTagGroup label="Selected categories" items={initial} onRemove={onRemove} />);
    expect(screen.getByRole('grid', { name: 'Selected categories' })).toBeVisible();
    expect(screen.getByText('Unknown choice')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove Seven' }));
    expect(onRemove).toHaveBeenCalledWith([7]);
    expect(screen.getByText('Seven')).toBeVisible();
  });

  test('deletes with native keyboard behavior and keeps the next surviving tag focused', async () => {
    const user = userEvent.setup();
    render(<ControlledTags />);
    await user.tab();
    await user.keyboard('{Delete}');
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(screen.getByRole('row', { name: /Seven/ })).toHaveFocus();
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(screen.queryByText('Seven')).not.toBeInTheDocument());
    expect(screen.getByRole('row', { name: /Unknown choice/ })).toHaveFocus();
  });

  test('omits removal actions for readonly collections and suppresses disabled mutations', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(<PharoTagGroup label="Selected categories" items={initial} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.tab();
    await user.keyboard('{Delete}');
    expect(screen.getByText('Alpha')).toBeVisible();
    rerender(
      <PharoTagGroup label="Selected categories" items={initial} onRemove={onRemove} isDisabled />,
    );
    const remove = screen.getByRole('button', { name: 'Remove Alpha' });
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
  });

  test('uses the complete custom removal name without duplicating the tag text', () => {
    render(
      <PharoTagGroup
        label="Selected categories"
        items={initial}
        onRemove={vi.fn()}
        removeLabel={(item) => `Discard category ${item.text}`}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Discard category Alpha' }),
    ).toBeVisible();
  });

  test('observes a rejected async removal and permits a later retry without losing controlled tags', async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValueOnce(new Error('Internal details'))
      .mockResolvedValue(undefined);
    render(<PharoTagGroup label="Selected categories" items={initial} onRemove={onRemove} />);
    const remove = screen.getByRole('button', { name: 'Remove Alpha' });
    await user.click(remove);
    expect(screen.getByText('Alpha')).toBeVisible();
    expect(screen.queryByText('Internal details')).not.toBeInTheDocument();
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(2);
  });
});
