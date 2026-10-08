import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ComparisonDateNavigation } from './ComparisonDateNavigation';

const first = Date.parse('2026-08-03');
const middle = Date.parse('2026-08-04');
const last = Date.parse('2026-08-05');
const timeline = [first, middle, last];

describe('ComparisonDateNavigation', () => {
  test('displays a temporary preview without pinning or offering a false reset action', () => {
    const change = vi.fn();
    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        previewTimestamp={first}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByText('Preview')).toBeVisible();
    expect(screen.queryByText('Latest')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '3');
    expect(screen.queryByRole('button', { name: 'Back to latest' })).not.toBeInTheDocument();

    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByText('Latest')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');
    expect(change).not.toHaveBeenCalled();
  });

  test('requests previous, next and Latest without keeping another selected date', async () => {
    const change = vi.fn();

    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByText('Latest')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /month/ })).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('spinbutton', { name: /year/ })).toHaveAttribute(
      'aria-valuenow',
      '2026',
    );
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Next date' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Back to latest' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Previous date' }));

    expect(change).toHaveBeenLastCalledWith(middle);
    // Controlled selection changes only when its owner supplies the new timestamp.
    expect(screen.getByText('Latest')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');

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

    expect(screen.getByRole('button', { name: 'Choose comparison date' })).toHaveFocus();
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');
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

    const trigger = screen.getByRole('button', { name: 'Choose comparison date' });

    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '4');

    trigger.focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Choose comparison date' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Tuesday, August 4, 2026/ })).toHaveAttribute(
      'data-selected',
    );

    await userEvent.keyboard('{ArrowLeft}{Enter}');

    expect(change).toHaveBeenLastCalledWith(first);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('follows the latest available date without committing a pin until a calendar choice', async () => {
    const change = vi.fn();
    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={[first]}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '3');

    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');
    expect(change).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Choose comparison date' }));
    await userEvent.click(screen.getByRole('button', { name: /Wednesday, August 5, 2026/ }));

    expect(change).toHaveBeenCalledExactlyOnceWith(last);
  });

  test('leaves an unavailable date field disabled until observations arrive', () => {
    const change = vi.fn();

    render(
      <ComparisonDateNavigation
        timeline={[]}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByRole('button', { name: 'Choose comparison date' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous date' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next date' })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });

  test('restores the displayed latest date after abandoning a partial edit of the final-date pin', async () => {
    const change = vi.fn();
    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={last}
        onTimestampChange={change}
      />,
    );

    screen.getByRole('spinbutton', { name: /month/ }).focus();
    await userEvent.keyboard('{Backspace}');

    expect(screen.getByRole('spinbutton', { name: /month/ })).toHaveAttribute('data-placeholder');

    await userEvent.click(screen.getByRole('button', { name: 'Back to latest' }));

    expect(change).toHaveBeenLastCalledWith(null);

    rerender(
      <ComparisonDateNavigation
        timeline={timeline}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByText('Latest')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /month/ })).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '5');
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
    expect(screen.getByRole('button', { name: 'Choose comparison date' })).toHaveFocus();

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
    expect(screen.getByRole('button', { name: 'Choose comparison date' })).toHaveFocus();

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

  test('opens on the latest historical month and marks missing observations unavailable', async () => {
    const change = vi.fn();

    render(
      <ComparisonDateNavigation
        timeline={[first, last]}
        selectedTimestamp={null}
        onTimestampChange={change}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Choose comparison date' });
    await userEvent.click(trigger);

    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Wednesday, August 5, 2026/ })).toHaveFocus();
    const missing = screen.getByRole('button', { name: /Tuesday, August 4, 2026/ });
    expect(missing).toHaveAttribute('data-unavailable');
    expect(missing).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(missing);

    expect(change).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test.each(['pin', 'history'] as const)(
    'rejects an unavailable typed date and clears validation after a %s change',
    async (update) => {
      const change = vi.fn();

      const { rerender } = render(
        <ComparisonDateNavigation
          timeline={[first, last]}
          selectedTimestamp={first}
          onTimestampChange={change}
        />,
      );

      screen.getByRole('spinbutton', { name: /day/ }).focus();
      await userEvent.keyboard('{ArrowUp}');

      expect(change).not.toHaveBeenCalled();
      expect(screen.getByText('Choose a date with recorded observations.')).toBeVisible();
      expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveFocus();
      expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute('aria-valuenow', '4');

      rerender(
        <ComparisonDateNavigation
          timeline={update === 'history' ? timeline : [first, last]}
          selectedTimestamp={update === 'pin' ? last : first}
          onTimestampChange={change}
        />,
      );

      expect(
        screen.queryByText('Choose a date with recorded observations.'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: /day/ })).toHaveAttribute(
        'aria-valuenow',
        update === 'pin' ? '5' : '3',
      );
      expect(change).not.toHaveBeenCalled();
    },
  );

  test('keeps partial segment edits local and returns to Latest only when all segments are cleared', async () => {
    const change = vi.fn();
    const selectedDate = Date.parse('2026-08-23');

    const { rerender } = render(
      <ComparisonDateNavigation
        timeline={[selectedDate, Date.parse('2026-08-25')]}
        selectedTimestamp={selectedDate}
        onTimestampChange={change}
      />,
    );

    screen.getByRole('spinbutton', { name: /month/ }).focus();
    await userEvent.keyboard('{Backspace}');

    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: /month/ })).toHaveAttribute('data-placeholder');

    rerender(
      <ComparisonDateNavigation
        timeline={[selectedDate, Date.parse('2026-08-25')]}
        selectedTimestamp={selectedDate}
        onTimestampChange={change}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /month/ })).toHaveAttribute('data-placeholder');

    screen.getByRole('spinbutton', { name: /day/ }).focus();
    await userEvent.keyboard('{Backspace>2}');
    screen.getByRole('spinbutton', { name: /year/ }).focus();
    await userEvent.keyboard('{Backspace>4}');

    expect(change).toHaveBeenLastCalledWith(null);
  });
});
