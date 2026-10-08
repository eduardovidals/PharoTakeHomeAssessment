import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PharoChartDataTable } from './PharoChartDataTable';
import type { PharoChartSeries } from '../../types';

const first = Date.UTC(2026, 5, 23);
const second = Date.UTC(2026, 5, 24);
const third = Date.UTC(2026, 5, 25);
const sensorA: PharoChartSeries = {
  id: 'a',
  label: 'Sensor A',
  points: [
    { x: third, y: null },
    { x: first, y: 1.23456789 },
  ],
};
const series: readonly PharoChartSeries[] = [
  sensorA,
  {
    id: 'b',
    label: 'Sensor B',
    points: [
      { x: second, y: -3 },
      { x: third, y: 0 },
    ],
  },
  { id: 'unknown', label: 'Unknown sensor', points: [] },
];

describe('PharoChartDataTable', () => {
  it('renders the exact recorded union with every selected column and semantic association', () => {
    render(<PharoChartDataTable series={series} caption="Raw measurements" />);
    const table = screen.getByRole('table', { name: 'Raw measurements' });
    expect(screen.getByRole('region', { name: 'Raw measurements' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Date (UTC)', 'Sensor A', 'Sensor B', 'Unknown sensor']);
    for (const header of within(table).getAllByRole('columnheader'))
      expect(header).toHaveAttribute('scope', 'col');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const [firstRow, secondRow, thirdRow] = rows;
    if (!firstRow || !secondRow || !thirdRow) throw new Error('Expected all three recorded rows.');
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1.23456789', 'Unavailable', 'Unavailable']);
    expect(
      within(secondRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Unavailable', '-3', 'Unavailable']);
    expect(
      within(thirdRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Unavailable', '0', 'Unavailable']);
    const header = screen.getByRole('rowheader', { name: '2026-06-23' });
    expect(header).toHaveAttribute('scope', 'row');
    expect(within(header).getByText('2026-06-23')).toHaveAttribute(
      'datetime',
      '2026-06-23T00:00:00.000Z',
    );
    expect(series[0]?.points[0]?.x).toBe(third);
  });

  it('keeps all-null actual dates in the alternative when no line can be drawn', () => {
    render(
      <PharoChartDataTable
        series={[
          {
            id: 'a',
            label: 'A',
            points: [
              { x: first, y: null },
              { x: third, y: null },
            ],
          },
        ]}
        caption="Missing measurements"
      />,
    );
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      '2026-06-23',
      '2026-06-25',
    ]);
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Unavailable',
      'Unavailable',
    ]);
  });

  it('separates visible dates and values from spoken dates without changing source precision', () => {
    render(
      <PharoChartDataTable
        series={[sensorA]}
        caption="Formatted measurements"
        formatXTable={() => 'Jun 23, 2026'}
        formatXAccessible={(x) =>
          x === first ? 'Tuesday, June 23, 2026' : 'Thursday, June 25, 2026'
        }
        formatYTable={(y) => y.toFixed(2)}
      />,
    );
    const header = screen.getByRole('rowheader', { name: 'Tuesday, June 23, 2026' });
    expect(header).toHaveTextContent('Jun 23, 2026');
    expect(header).toHaveAttribute('scope', 'row');
    expect(header).toHaveAttribute('aria-label', 'Tuesday, June 23, 2026');
    const time = within(header).getByText('Jun 23, 2026');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-06-23T00:00:00.000Z');
    expect(time).not.toHaveAttribute('aria-label');
    expect(screen.getByText('1.23', { exact: true })).toBeVisible();
    expect(screen.getByText('Unavailable', { exact: true })).toBeVisible();
    expect(series[0]?.points[1]?.y).toBe(1.23456789);
  });

  it('retains empty series headers and explains absent records without fabricating a zero row', () => {
    render(
      <PharoChartDataTable
        series={[{ id: 'unknown', label: 'Unknown sensor', points: [] }]}
        caption="Empty measurements"
        emptyMessage="No samples recorded."
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Unknown sensor' })).toBeVisible();
    expect(screen.queryAllByRole('rowheader')).toEqual([]);
    expect(screen.getByRole('cell', { name: 'No samples recorded.' })).toHaveAttribute(
      'colspan',
      '2',
    );
  });

  it('reports invalid input safely and retains complete long text in valid data', () => {
    const { rerender } = render(
      <PharoChartDataTable
        series={[{ id: 'bad', label: 'Do not expose', points: [{ x: first, y: Infinity }] }]}
        caption="Invalid readings"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Chart data is invalid.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const label =
      'A complete, deliberately long measurement name without clipping or label substitution';
    rerender(
      <PharoChartDataTable
        series={[{ id: 'long', label, points: [{ x: first, y: Number.MAX_VALUE }] }]}
        caption="Long readings"
      />,
    );
    expect(screen.getByRole('columnheader', { name: label })).toBeVisible();
    expect(screen.getByRole('cell')).toHaveTextContent(Number.MAX_VALUE.toString());
  });
});
