import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartResizeObserver } from '../../../test/setup';
import { PharoLineChart } from './PharoLineChart';
import type { PharoChartSeries, PharoLineChartProps } from './types';

const observations: readonly PharoChartSeries[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    points: [
      { x: Date.UTC(2024, 2, 10), y: -10 },
      { x: Date.UTC(2024, 2, 11), y: 0 },
      { x: Date.UTC(2024, 2, 12), y: 10 },
    ],
  },
];

function measure(container: Element, width = 672, height = 320) {
  const owners = ChartResizeObserver.instances.flatMap((observer) =>
    [...observer.targets]
      .filter((target) => container.contains(target))
      .map((target) => ({ observer, target })),
  );
  if (!owners.length) throw new Error('The rendered chart has no active measurement owner.');
  act(() => {
    for (const { observer, target } of owners) observer.deliver(target, width, height);
  });
}

function renderChart(props: PharoLineChartProps) {
  const view = render(null);
  view.rerender(<PharoLineChart {...props} />);
  measure(view.container);
  return view;
}

function seriesGroup(chart: Element, id: string) {
  const group = [...chart.querySelectorAll('g[data-series-id]')].find(
    (candidate) => candidate.getAttribute('data-series-id') === id,
  );
  if (!group) throw new Error(`Expected rendered series ${id}.`);
  return group;
}

function namedSeries(id: string): PharoChartSeries {
  return {
    id,
    label: id,
    points: [
      { x: 0, y: 0 },
      { x: 86_400_000, y: 10 },
    ],
  };
}

describe('PharoLineChart', () => {
  it('rejects untyped BigInt identifiers and cyclic appearance objects without throwing during identity setup', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const bigintId: PharoChartSeries = {
      // @ts-expect-error Runtime callers may violate the string identity contract.
      id: 1n,
      label: 'Malformed identity',
      points: [{ x: 0, y: 1 }],
    };
    const cyclicAppearance: PharoChartSeries = {
      id: 'cyclic',
      label: 'Malformed appearance',
      points: [{ x: 0, y: 1 }],
      // @ts-expect-error Runtime appearance is validated before identity serialization.
      appearance: cyclic,
    };
    const view = renderChart({ series: [bigintId], label: 'Invalid runtime data' });
    expect(screen.getByRole('status', { name: 'Invalid runtime data' })).toHaveTextContent(
      'Chart data is invalid.',
    );
    view.rerender(<PharoLineChart series={[cyclicAppearance]} label="Invalid runtime data" />);
    expect(screen.getByRole('status', { name: 'Invalid runtime data' })).toHaveTextContent(
      'Chart data is invalid.',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveAttribute(
      'data-chart-reason',
      'PHARO-CHART-DATA',
    );
  });

  it('preserves distinct close numeric tick values in full default formatter titles', () => {
    renderChart({
      label: 'Precise readings',
      series: [
        {
          id: 'precise',
          label: 'Precise',
          points: [
            { x: 0, y: 1.00000001 },
            { x: 86_400_000, y: 1.00000002 },
          ],
        },
      ],
    });
    const axis = within(screen.getByRole('img', { name: 'Precise readings' })).getByLabelText(
      'Value axis',
    );
    const fullValues = [...axis.querySelectorAll('title')].map((title) => title.textContent);
    expect(fullValues).toContain('1.00000001');
    expect(fullValues).toContain('1.00000002');
    expect(new Set(fullValues).size).toBe(fullValues.length);
    expect(fullValues).not.toContain('1');
  });

  it('renders named and described SVG with generic axes and chronological UTC labels', () => {
    renderChart({
      series: observations,
      label: 'Daily temperatures',
      description: 'Recorded measurements.',
      xAxisLabel: 'UTC date',
      yAxisLabel: 'Degrees',
    });
    const chart = screen.getByRole('img', { name: 'Daily temperatures' });
    expect(chart).toHaveAccessibleDescription('Recorded measurements.');
    expect(chart).toHaveAttribute('viewBox', '0 0 672 320');
    const timeAxis = within(chart).getByLabelText('UTC time axis');
    const dates = [...timeAxis.querySelectorAll('title')].map((title) => title.textContent);
    expect(dates).toContain('2024-03-10');
    expect(dates).toContain('2024-03-12');
    expect(dates).not.toContain('2024-03-09');
    expect(new Set(dates).size).toBe(dates.length);
    const valueAxis = within(chart).getByLabelText('Value axis');
    expect(valueAxis).toHaveTextContent('-10');
    expect(valueAxis.textContent).not.toMatch(/USD|\$/);
    expect(chart).toHaveTextContent('UTC date');
    expect(chart).toHaveTextContent('Degrees');
    expect(seriesGroup(chart, 'temperature').querySelector('path')).toHaveAttribute(
      'd',
      'M56,272L356,144L656,16',
    );
  });

  it('keeps measured layout classes and produces no SVG until there is useful plot space', () => {
    const view = render(
      <PharoLineChart series={observations} label="Waiting for layout" className="max-w-sm h-96" />,
    );
    expect(screen.getByRole('status', { name: 'Waiting for layout' })).toHaveTextContent(
      'Chart needs more space to display.',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveClass('max-w-sm', 'h-96', 'w-full');
    expect(view.container.firstElementChild).not.toHaveClass('h-pharo-chart-height');
    measure(view.container);
    expect(screen.getByRole('img', { name: 'Waiting for layout' })).toBeVisible();
    measure(view.container, 0, 0);
    expect(screen.getByRole('status', { name: 'Waiting for layout' })).toHaveTextContent(
      'Chart needs more space to display.',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps both endpoint dates readable at 256 pixels and restores the middle date when widened', () => {
    const view = renderChart({ series: observations, label: 'Narrow date labels' });
    const chart = screen.getByRole('img', { name: 'Narrow date labels' });
    function visibleDates() {
      const timeAxis = within(chart).getByLabelText('UTC time axis');
      return [...timeAxis.querySelectorAll('text title')].map((title) => title.textContent);
    }
    expect(visibleDates()).toEqual(['2024-03-10', '2024-03-11', '2024-03-12']);
    measure(view.container, 256, 320);
    expect(visibleDates()).toEqual(['2024-03-10', '2024-03-12']);
    expect(chart).toHaveAttribute('viewBox', '0 0 256 320');
    measure(view.container, 672, 320);
    expect(visibleDates()).toEqual(['2024-03-10', '2024-03-11', '2024-03-12']);
  });

  it('draws visible singleton markers around a missing observation without a connecting line', () => {
    renderChart({
      label: 'Missing readings',
      series: [
        {
          id: 'a',
          label: 'Sensor A',
          points: [
            { x: 0, y: 0 },
            { x: 86_400_000, y: null },
            { x: 172_800_000, y: 20 },
          ],
        },
      ],
    });
    const group = seriesGroup(screen.getByRole('img', { name: 'Missing readings' }), 'a');
    expect(group.querySelector('path')).toHaveAttribute('d', 'M56,272ZM656,16Z');
    const markers = group.querySelectorAll('circle');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('cx', '56');
    expect(markers[0]).toHaveAttribute('cy', '272');
    expect(markers[1]).toHaveAttribute('cx', '656');
    expect(markers[1]).toHaveAttribute('cy', '16');
    for (const marker of markers) {
      expect(Number(marker.getAttribute('r'))).toBeGreaterThan(0);
      expect(marker).toHaveClass('fill-pharo-chart-1');
      expect(marker.closest('[clip-path]')).toBeNull();
      const radius = Number(marker.getAttribute('r'));
      const x = Number(marker.getAttribute('cx'));
      const y = Number(marker.getAttribute('cy'));
      expect(x - radius).toBeGreaterThanOrEqual(0);
      expect(x + radius).toBeLessThanOrEqual(672);
      expect(y - radius).toBeGreaterThanOrEqual(0);
      expect(y + radius).toBeLessThanOrEqual(320);
    }
  });

  it.each([
    { name: 'empty', input: [], message: 'No observations to display.' },
    {
      name: 'missing',
      input: [{ id: 'a', label: 'A', points: [{ x: 0, y: null }] }],
      message: 'No observations to display.',
    },
    {
      name: 'invalid',
      input: [{ id: 'a', label: 'A', points: [{ x: 0, y: NaN }] }],
      message: 'Chart data is invalid.',
    },
    {
      name: 'unsafe',
      input: [{ id: 'a', label: 'A', points: [{ x: 0, y: Number.MAX_VALUE }] }],
      message: 'Chart values cannot be represented safely.',
    },
  ])(
    'exposes the $name state accessibly without fabricated SVG data',
    ({ name, input, message }) => {
      const view = renderChart({ series: input, label: name });
      expect(screen.getByRole('status', { name })).toHaveTextContent(message);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(view.container.querySelector('path')).toBeNull();
      expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);
    },
  );

  it('retains full caller formatter output in accessible titles and passes numerical values', () => {
    const formatX = vi.fn((value: number) => `Observation timestamp ${value}`);
    const formatY = vi.fn((value: number) => `Measured value ${value}`);
    renderChart({ series: observations, label: 'Custom labels', formatX, formatY });
    const chart = screen.getByRole('img', { name: 'Custom labels' });
    const fullTitles = [...chart.querySelectorAll('text title')].map((title) => title.textContent);
    expect(fullTitles).toContain(`Observation timestamp ${Date.UTC(2024, 2, 10)}`);
    expect(fullTitles).toContain('Measured value -10');
    expect(formatX).toHaveBeenCalled();
    expect(formatY).toHaveBeenCalled();
    expect(formatX.mock.calls.every(([value]) => Number.isFinite(value))).toBe(true);
    expect(formatY.mock.calls.every(([value]) => Number.isFinite(value))).toBe(true);
    expect(seriesGroup(chart, 'temperature').querySelector('path')).toHaveAttribute(
      'd',
      'M56,272L356,144L656,16',
    );
  });

  it.each(['x', 'y'])(
    'propagates a caller-owned %s formatter exception rather than relabeling it as invalid data',
    (axis) => {
      const failure = new Error('Caller formatter failed.');
      const formatter = () => {
        throw failure;
      };
      const view = render(
        <PharoLineChart
          series={observations}
          label="Caller formatting"
          formatX={axis === 'x' ? formatter : undefined}
          formatY={axis === 'y' ? formatter : undefined}
        />,
      );
      expect(() => measure(view.container)).toThrow(failure);
      expect(screen.queryByText('Chart data is invalid.')).not.toBeInTheDocument();
    },
  );

  it('gives two simultaneous charts independent accessible and clipping references and measurements', () => {
    const view = render(
      <>
        <PharoLineChart series={observations} label="First chart" description="First description" />
        <PharoLineChart
          series={observations}
          label="Second chart"
          description="Second description"
        />
      </>,
    );
    const owners = ChartResizeObserver.instances.flatMap((observer) =>
      [...observer.targets].map((target) => ({ observer, target })),
    );
    expect(owners).toHaveLength(2);
    const firstOwner = owners[0];
    const secondOwner = owners[1];
    if (!firstOwner || !secondOwner) throw new Error('Both charts must own an observer.');
    act(() => {
      firstOwner.observer.deliver(firstOwner.target, 672, 320);
      secondOwner.observer.deliver(secondOwner.target, 372, 192);
    });
    const first = screen.getByRole('img', { name: 'First chart' });
    const second = screen.getByRole('img', { name: 'Second chart' });
    expect(first).toHaveAccessibleDescription('First description');
    expect(second).toHaveAccessibleDescription('Second description');
    const ids = [...view.container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chart of [first, second]) {
      const clipId = chart.querySelector('clipPath')?.id;
      expect(clipId).toBeTruthy();
      for (const path of chart.querySelectorAll('g[data-series-id] path')) {
        expect(path).toHaveAttribute('clip-path', `url(#${clipId})`);
      }
      expect(chart.querySelector('title')?.id).toBe(chart.getAttribute('aria-labelledby'));
      expect(chart.querySelector('desc')?.id).toBe(chart.getAttribute('aria-describedby'));
    }
    expect(first).toHaveAttribute('viewBox', '0 0 672 320');
    expect(second).toHaveAttribute('viewBox', '0 0 372 192');
    act(() => firstOwner.observer.deliver(firstOwner.target, 500, 300));
    expect(first).toHaveAttribute('viewBox', '0 0 500 300');
    expect(second).toHaveAttribute('viewBox', '0 0 372 192');
  });

  it('keeps active identity through reorder, removal, insertion and a returning-slot collision', () => {
    const a = namedSeries('a');
    const b = namedSeries('b');
    const c = namedSeries('c');
    const d = namedSeries('d');
    const view = renderChart({ series: [a, b, c], label: 'Stable identities' });
    const chart = screen.getByRole('img', { name: 'Stable identities' });
    expect(seriesGroup(chart, 'a')).toHaveAttribute('data-appearance', 'primary');
    expect(seriesGroup(chart, 'b')).toHaveAttribute('data-appearance', 'secondary');
    expect(seriesGroup(chart, 'c')).toHaveAttribute('data-appearance', 'tertiary');
    view.rerender(<PharoLineChart series={[c, a, b]} label="Stable identities" />);
    expect(seriesGroup(chart, 'a')).toHaveAttribute('data-appearance', 'primary');
    expect(seriesGroup(chart, 'b')).toHaveAttribute('data-appearance', 'secondary');
    expect(seriesGroup(chart, 'c')).toHaveAttribute('data-appearance', 'tertiary');
    view.rerender(<PharoLineChart series={[b, c]} label="Stable identities" />);
    view.rerender(<PharoLineChart series={[b, c, d]} label="Stable identities" />);
    expect(seriesGroup(chart, 'd')).toHaveAttribute('data-appearance', 'primary');
    view.rerender(<PharoLineChart series={[b, d]} label="Stable identities" />);
    view.rerender(<PharoLineChart series={[a, b, d]} label="Stable identities" />);
    expect(seriesGroup(chart, 'a')).toHaveAttribute('data-appearance', 'tertiary');
    expect(seriesGroup(chart, 'b')).toHaveAttribute('data-appearance', 'secondary');
    expect(seriesGroup(chart, 'd')).toHaveAttribute('data-appearance', 'primary');
    expect(seriesGroup(chart, 'a').querySelector('path')).toHaveClass('stroke-pharo-chart-3');
    expect(seriesGroup(chart, 'a').querySelector('path')).toHaveAttribute(
      'stroke-dasharray',
      'var(--pharo-chart-dash-3)',
    );
    expect(seriesGroup(chart, 'b').querySelector('path')).toHaveClass('stroke-pharo-chart-2');
    expect(seriesGroup(chart, 'd').querySelector('path')).toHaveClass('stroke-pharo-chart-1');
  });

  it('reuses a returning historical identity when it remains free', () => {
    const a = namedSeries('a');
    const b = namedSeries('b');
    const view = renderChart({ series: [a, b], label: 'Historical identities' });
    view.rerender(<PharoLineChart series={[a]} label="Historical identities" />);
    view.rerender(<PharoLineChart series={[b, a]} label="Historical identities" />);
    const chart = screen.getByRole('img', { name: 'Historical identities' });
    expect(seriesGroup(chart, 'a')).toHaveAttribute('data-appearance', 'primary');
    expect(seriesGroup(chart, 'b')).toHaveAttribute('data-appearance', 'secondary');
  });

  it('honors explicit semantic appearances and exposes conflicts as a named unavailable state', () => {
    const a: PharoChartSeries = { ...namedSeries('a'), appearance: 'tertiary' };
    const b: PharoChartSeries = { ...namedSeries('b'), appearance: 'primary' };
    const view = renderChart({ series: [a, b], label: 'Explicit identities' });
    const chart = screen.getByRole('img', { name: 'Explicit identities' });
    expect(seriesGroup(chart, 'a').querySelector('path')).toHaveClass('stroke-pharo-chart-3');
    expect(seriesGroup(chart, 'a').querySelector('path')).toHaveAttribute(
      'stroke-dasharray',
      'var(--pharo-chart-dash-3)',
    );
    view.rerender(
      <PharoLineChart label="Explicit identities" series={[a, { ...b, appearance: 'tertiary' }]} />,
    );
    expect(screen.getByRole('status', { name: 'Explicit identities' })).toHaveTextContent(
      'Chart data is invalid.',
    );
    expect(view.container.firstElementChild).toHaveAttribute(
      'data-chart-reason',
      'PHARO-CHART-DATA',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
