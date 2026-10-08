import type { PharoChartSeries } from '@pharo/react-charts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { toUtcTimestamp } from '../../../../../../utils/date';
import { ObservationDialog } from './ObservationDialog';

const series: readonly PharoChartSeries[] = Object.freeze([
  Object.freeze({
    id: 'A',
    label: 'A',
    points: Object.freeze([
      Object.freeze({ x: toUtcTimestamp('2024-03-10'), y: 11.125 }),
      Object.freeze({ x: toUtcTimestamp('2024-03-12'), y: 20.123456789 }),
    ]),
  }),
  Object.freeze({
    id: 'B',
    label: 'B',
    points: Object.freeze([Object.freeze({ x: toUtcTimestamp('2024-03-11'), y: 250.123456789 })]),
  }),
  Object.freeze({ id: 'UNKNOWN', label: 'UNKNOWN', points: Object.freeze([]) }),
]);

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'View data' }));
  return screen.findByRole('dialog', { name: 'Raw observations' });
}

describe('ObservationDialog', () => {
  test('shows every actual raw row and selected column with truthful windows and bases', async () => {
    const original = JSON.stringify(series);
    render(<ObservationDialog triggerId="raw-data" series={series} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const dialog = await openDialog();
    expect(within(dialog).getByText(/currency is not specified/)).toBeVisible();
    expect(within(dialog).getByText(/stay raw in both Price and Performance/)).toBeVisible();
    const windows = within(
      within(dialog).getByRole('list', { name: 'Recorded windows by instrument' }),
    );
    expect(
      windows.getByText(
        /A: Mar 10 – Mar 12, 2024 \(UTC\), 2 observations\. Performance base: Mar 10, 2024\./,
      ),
    ).toBeVisible();
    expect(
      windows.getByText(
        /B: Mar 11, 2024 \(UTC\), 1 observation\. Performance base: Mar 11, 2024\./,
      ),
    ).toBeVisible();
    expect(
      windows.getByText('UNKNOWN: No recorded observations currently available.'),
    ).toBeVisible();
    const table = within(dialog).getByRole('table', { name: 'Recorded closing prices' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Date (UTC)', 'A', 'B', 'UNKNOWN']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['11.13', 'Unavailable', 'Unavailable'],
      ['Unavailable', '250.12', 'Unavailable'],
      ['20.12', 'Unavailable', 'Unavailable'],
    ]);
    expect(
      Array.from(table.querySelectorAll('time')).map((time) => [time.dateTime, time.textContent]),
    ).toEqual([
      ['2024-03-10T00:00:00.000Z', 'Mar 10, 2024'],
      ['2024-03-11T00:00:00.000Z', 'Mar 11, 2024'],
      ['2024-03-12T00:00:00.000Z', 'Mar 12, 2024'],
    ]);
    expect(within(table).getByRole('rowheader', { name: 'Sunday, March 10, 2024' })).toBeVisible();
    expect(JSON.stringify(series)).toBe(original);
  });

  test('uses native opening, dismissal and trigger focus restoration', async () => {
    const user = userEvent.setup();
    render(<ObservationDialog triggerId="raw-focus" series={series} />);
    const trigger = screen.getByRole('button', { name: 'View data' });
    expect(trigger).toHaveAttribute('id', 'raw-focus');
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Raw observations' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('uses current raw props while open without resetting modal state', async () => {
    const view = render(<ObservationDialog triggerId="raw-current" series={series} />);
    const dialog = await openDialog();
    const updated: readonly PharoChartSeries[] = [
      { id: 'B', label: 'B', points: [{ x: toUtcTimestamp('2024-02-29'), y: 1234.56789 }] },
    ];
    view.rerender(<ObservationDialog triggerId="raw-current" series={updated} />);
    expect(screen.getByRole('dialog', { name: 'Raw observations' })).toBe(dialog);
    const table = within(dialog).getByRole('table', { name: 'Recorded closing prices' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Date (UTC)', 'B']);
    expect(within(table).getByRole('cell', { name: '1,234.57' })).toBeVisible();
    expect(
      within(table).getByRole('rowheader', { name: 'Thursday, February 29, 2024' }),
    ).toBeVisible();
    expect(updated[0]?.points[0]?.y).toBe(1234.56789);
  });

  test('retains every unavailable selected identity without fabricated dates or values', async () => {
    render(
      <ObservationDialog
        triggerId="raw-empty"
        series={[
          { id: 'UNKNOWN', label: 'UNKNOWN', points: [] },
          { id: 'EMPTY', label: 'EMPTY', points: [] },
        ]}
      />,
    );
    const dialog = await openDialog();
    const table = within(dialog).getByRole('table', { name: 'Recorded closing prices' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Date (UTC)', 'UNKNOWN', 'EMPTY']);
    expect(within(table).getByRole('cell')).toHaveTextContent('No recorded observations.');
    expect(table.querySelectorAll('time')).toHaveLength(0);
    expect(within(dialog).queryByText(/Performance base:/)).not.toBeInTheDocument();
  });
});
