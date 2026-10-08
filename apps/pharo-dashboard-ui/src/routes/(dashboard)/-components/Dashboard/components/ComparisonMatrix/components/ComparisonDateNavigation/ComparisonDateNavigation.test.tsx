import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ComparisonDateNavigation } from './ComparisonDateNavigation';

const first = Date.parse('2026-08-03');
const middle = Date.parse('2026-08-04');
const last = Date.parse('2026-08-05');
const timeline = [first, middle, last];

describe('ComparisonDateNavigation', () => {
  test('requests previous, next and Latest without keeping another selected date', async () => {
    const change = vi.fn();
    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );
    expect(screen.getByRole('button', { name: /Comparison date/ })).toHaveTextContent('Latest');
    expect(screen.getByRole('button', { name: 'Next date' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Back to latest' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous date' }));
    expect(change).toHaveBeenLastCalledWith(middle);
    // Controlled selection changes only when its owner supplies the new timestamp.
    expect(screen.getByRole('button', { name: /Comparison date/ })).toHaveTextContent('Latest');
    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={first}
        onTimestampChange={change}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous date' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next date' }));
    expect(change).toHaveBeenLastCalledWith(middle);
    await userEvent.click(screen.getByRole('button', { name: 'Back to latest' }));
    expect(change).toHaveBeenLastCalledWith(null);
    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );
    expect(screen.getByRole('button', { name: /Comparison date/ })).toHaveFocus();
  });

  test('supports keyboard date selection and retains a date missing from a new timeline', async () => {
    const change = vi.fn();
    render(
      <ComparisonDateNavigation
        timeline={[first, last]}
        selectedTimestamp={middle}
        onTimestampChange={change}
      />,
    );
    const trigger = screen.getByRole('button', { name: /Comparison date/ });
    expect(trigger).toHaveTextContent('Aug 4, 2026');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Aug 4, 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{Home}{ArrowDown}{Enter}');
    expect(change).toHaveBeenLastCalledWith(first);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('restores focus after either arrow reaches its disabled endpoint without affecting other date changes', async () => {
    const change = vi.fn();
    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={middle}
        onTimestampChange={change}
      />,
    );
    const previous = screen.getByRole('button', { name: 'Previous date' });
    previous.focus();
    await userEvent.keyboard('{Enter}');
    expect(change).toHaveBeenLastCalledWith(first);
    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={first}
        onTimestampChange={change}
      />,
    );
    expect(previous).toBeDisabled();
    expect(screen.getByRole('button', { name: /Comparison date/ })).toHaveFocus();

    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={middle}
        onTimestampChange={change}
      />,
    );
    const next = screen.getByRole('button', { name: 'Next date' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    expect(change).toHaveBeenLastCalledWith(last);
    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={last}
        onTimestampChange={change}
      />,
    );
    expect(next).toBeDisabled();
    expect(screen.getByRole('button', { name: /Comparison date/ })).toHaveFocus();

    const back = screen.getByRole('button', { name: 'Back to latest' });
    back.focus();
    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={middle}
        onTimestampChange={change}
      />,
    );
    expect(back).toHaveFocus();
  });
});
