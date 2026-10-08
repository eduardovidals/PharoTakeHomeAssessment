import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

function measuredContainer(container: Element): Element {
  const targets = new Set(
    ChartResizeObserver.instances.flatMap((observer) =>
      [...observer.targets].filter((target) => container.contains(target)),
    ),
  );
  if (targets.size !== 1) throw new Error('Expected exactly one observed chart container.');
  const target = [...targets][0];
  if (!target) throw new Error('The measured chart container is absent.');
  return target;
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

const firstDate = Date.UTC(2024, 2, 10);
const day = 86_400_000;
const unequalObservations: readonly PharoChartSeries[] = Object.freeze([
  Object.freeze({
    id: 'a',
    label: 'Sensor A',
    points: Object.freeze([
      Object.freeze({ x: firstDate, y: 2 }),
      Object.freeze({ x: firstDate + day, y: null }),
      Object.freeze({ x: firstDate + 3 * day, y: 8 }),
    ]),
  }),
  Object.freeze({
    id: 'b',
    label: 'Sensor B',
    points: Object.freeze([
      Object.freeze({ x: firstDate + day, y: 20 }),
      Object.freeze({ x: firstDate + 2 * day, y: 30 }),
    ]),
  }),
]);

function pointer(
  target: Element,
  type: string,
  clientX: number,
  pointerType = 'mouse',
  clientY = 100,
) {
  // jsdom does not implement PointerEvent. Keep the synthetic event local to this test,
  // retaining real client coordinates and the React pointer-handler event fields.
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: 1 },
  });
  fireEvent(target, event);
}

function mockScaledBounds(chart: Element) {
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 20, 336, 160));
}

function expectLegendAppearance(label: string, id: string, token: number) {
  const legend = screen.getByRole('list', { name: `Legend for ${label}` });
  const item = within(legend)
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByText(id, { exact: true }));
  if (!item) throw new Error(`Expected legend entry ${id}.`);
  expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(item.querySelector('path')).toHaveClass(`stroke-pharo-chart-${token}`);
  expect(item.querySelector('path')).toHaveAttribute(
    'stroke-dasharray',
    `var(--pharo-chart-dash-${token})`,
  );
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
    expect(measuredContainer(view.container)).toHaveAttribute(
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
    expect(measuredContainer(view.container)).toHaveClass('max-w-sm', 'h-96', 'w-full');
    expect(measuredContainer(view.container)).not.toHaveClass('h-pharo-chart-height');
    measure(view.container);
    expect(screen.getByRole('img', { name: 'Waiting for layout' })).toBeVisible();
    measure(view.container, 0, 0);
    expect(screen.getByRole('status', { name: 'Waiting for layout' })).toHaveTextContent(
      'Chart needs more space to display.',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses short candidate-axis labels without changing detailed dates, data values or native inspection', () => {
    renderChart({
      series: unequalObservations,
      label: 'Recorded candidates',
      xTickValues: [firstDate, firstDate + 3 * day],
      formatXAxis: (timestamp) => `Mar ${new Date(timestamp).getUTCDate()}`,
      formatX: (timestamp) => `Full date ${new Date(timestamp).toISOString().slice(0, 10)}`,
    });
    const chart = screen.getByRole('img', { name: 'Recorded candidates' });
    const axis = within(chart).getByLabelText('UTC time axis');
    expect([...axis.querySelectorAll('title')].map((title) => title.textContent)).toEqual([
      'Mar 10',
      'Mar 13',
    ]);
    expect(axis.querySelector('[textLength]')).toBeNull();
    const slider = screen.getByRole('slider', { name: 'Inspect Recorded candidates' });
    expect(slider).toHaveAttribute('max', '3');
    fireEvent.change(slider, { target: { value: '1' } });
    const details = screen.getByRole('region', { name: 'Details for Recorded candidates' });
    expect(details).toHaveTextContent('Full date 2024-03-11');
    expect(details).toHaveTextContent('Unavailable');
    expect(details).toHaveTextContent('20');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show data table for Recorded candidates' }),
    );
    const table = screen.getByRole('table', { name: 'Data for Recorded candidates' });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(4);
    expect(within(table).getByRole('rowheader', { name: 'Full date 2024-03-12' })).toBeVisible();
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
    expectLegendAppearance('Stable identities', 'a', 3);
    expectLegendAppearance('Stable identities', 'b', 2);
    expectLegendAppearance('Stable identities', 'd', 1);
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
    expect(measuredContainer(view.container)).toHaveAttribute(
      'data-chart-reason',
      'PHARO-CHART-DATA',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('PharoLineChart recorded observation access', () => {
  it('names the native range and exposes exact values or unavailable without a pointer live region', () => {
    const view = renderChart({ series: unequalObservations, label: 'Unequal dates' });
    const slider = screen.getByRole('slider', { name: 'Inspect Unequal dates' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveValue('0');
    expect(slider).toHaveAccessibleDescription();
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '2024-03-10; Sensor A: 2; Sensor B: Unavailable',
    );
    // A DOM change proves the React handler; Playwright owns native range-key defaults.
    fireEvent.change(slider, { target: { value: '1' } });
    const details = screen.getByRole('region', { name: 'Details for Unequal dates' });
    expect(details).toHaveTextContent('2024-03-11');
    expect(details).toHaveTextContent('Sensor A');
    expect(details).toHaveTextContent('Unavailable');
    expect(details).toHaveTextContent('Sensor B');
    expect(within(details).getByText('20', { exact: true })).toBeVisible();
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '2024-03-11; Sensor A: Unavailable; Sensor B: 20',
    );
    expect(view.container.querySelector('[aria-live]:not([aria-live="off"])')).toBeNull();
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('maps scaled pointer client coordinates to the union, takes earlier ties and clamps to observations', () => {
    renderChart({ series: unequalObservations, label: 'Scaled pointer' });
    const chart = screen.getByRole('img', { name: 'Scaled pointer' });
    mockScaledBounds(chart);
    const child = seriesGroup(chart, 'a').querySelector('path');
    if (!child) throw new Error('Expected an actual observation path as the event target.');
    const slider = screen.getByRole('slider', { name: 'Inspect Scaled pointer' });
    // SVG x=356 in a672-unit viewBox is clientX278 in the336px box: exact1.5day tie.
    pointer(child, 'pointermove', 278);
    expect(slider).toHaveValue('1');
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '2024-03-11; Sensor A: Unavailable; Sensor B: 20',
    );
    pointer(chart, 'pointermove', 328, 'pen');
    expect(slider).toHaveValue('2');
    expect(screen.getByRole('region', { name: 'Details for Scaled pointer' })).toHaveTextContent(
      '2024-03-12',
    );
    pointer(chart, 'pointermove', -100);
    expect(slider).toHaveValue('0');
    pointer(chart, 'pointermove', 1_000);
    expect(slider).toHaveValue('3');
    pointer(chart, 'pointerleave', 1_000);
    expect(slider).toHaveValue('3');
  });

  it('accepts a completed touch tap but ignores moved or cancelled touch gestures', () => {
    renderChart({ series: unequalObservations, label: 'Touch handler' });
    const chart = screen.getByRole('img', { name: 'Touch handler' });
    mockScaledBounds(chart);
    const slider = screen.getByRole('slider', { name: 'Inspect Touch handler' });
    pointer(chart, 'pointerdown', 328, 'touch');
    pointer(chart, 'pointerup', 328, 'touch');
    expect(slider).toHaveValue('2');
    pointer(chart, 'pointerdown', 128, 'touch');
    pointer(chart, 'pointermove', 128, 'touch', 140);
    pointer(chart, 'pointerup', 128, 'touch', 140);
    expect(slider).toHaveValue('2');
    pointer(chart, 'pointerdown', 128, 'touch');
    pointer(chart, 'pointercancel', 128, 'touch');
    pointer(chart, 'pointerup', 128, 'touch');
    expect(slider).toHaveValue('2');
  });

  it('preserves selection through resize and order changes, then reconciles a removed date to its earlier neighbor', () => {
    const view = renderChart({ series: unequalObservations, label: 'Changing dates' });
    fireEvent.change(screen.getByRole('slider', { name: 'Inspect Changing dates' }), {
      target: { value: '2' },
    });
    view.rerender(
      <PharoLineChart series={[...unequalObservations].reverse()} label="Changing dates" />,
    );
    measure(view.container, 320, 320);
    expect(screen.getByRole('slider', { name: 'Inspect Changing dates' })).toHaveValue('2');
    measure(view.container, 0, 0);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    measure(view.container, 672, 320);
    expect(screen.getByRole('slider', { name: 'Inspect Changing dates' })).toHaveValue('2');
    const updated = unequalObservations.map((item) => ({
      ...item,
      points: item.points.filter((point) => point.x !== firstDate + 2 * day),
    }));
    view.rerender(<PharoLineChart series={updated} label="Changing dates" />);
    expect(screen.getByRole('slider', { name: 'Inspect Changing dates' })).toHaveValue('1');
    expect(screen.getByRole('region', { name: 'Details for Changing dates' })).toHaveTextContent(
      '2024-03-11',
    );
    expect(unequalObservations[1]?.points).toEqual([
      { x: firstDate + day, y: 20 },
      { x: firstDate + 2 * day, y: 30 },
    ]);
  });

  it.each(['empty', 'invalid'] as const)(
    'clears the selected observation after an %s state',
    (state) => {
      const view = renderChart({ series: unequalObservations, label: 'Reset inspection' });
      fireEvent.change(screen.getByRole('slider', { name: 'Inspect Reset inspection' }), {
        target: { value: '3' },
      });
      view.rerender(
        <PharoLineChart
          label="Reset inspection"
          series={
            state === 'empty' ? [] : [{ id: 'bad', label: 'Bad', points: [{ x: 0, y: NaN }] }]
          }
        />,
      );
      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Details for Reset inspection' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /data table/ })).not.toBeInTheDocument();
      view.rerender(<PharoLineChart series={unequalObservations} label="Reset inspection" />);
      expect(screen.getByRole('slider', { name: 'Inspect Reset inspection' })).toHaveValue('0');
    },
  );

  it('shows every exact union-date cell in an associated table without re-owning or resizing the chart', () => {
    const view = renderChart({ series: unequalObservations, label: 'Readable table' });
    const measured = measuredContainer(view.container);
    const owners = [...ChartResizeObserver.instances];
    const button = screen.getByRole('button', { name: 'Show data table for Readable table' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Hide data table for Readable table');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table', { name: 'Data for Readable table' });
    const target = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(target === table || target?.contains(table)).toBe(true);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Date (UTC)', 'Sensor A', 'Sensor B']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['2024-03-10', '2024-03-11', '2024-03-12', '2024-03-13']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent),
        ),
    ).toEqual([
      ['2', 'Unavailable'],
      ['Unavailable', '20'],
      ['Unavailable', '30'],
      ['8', 'Unavailable'],
    ]);
    expect(measuredContainer(view.container)).toBe(measured);
    expect(ChartResizeObserver.instances).toEqual(owners);
    for (const owner of owners) expect(owner.disconnect).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Readable table' })).toHaveAttribute('height', '320');
    expect(measured.contains(table)).toBe(false);
    fireEvent.click(button);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('retains full custom formatted dates and values in details and the table', () => {
    const formatX = (value: number) => `Full recorded UTC timestamp ${value}`;
    const formatY = (value: number) => `Full measured observation ${value} degrees`;
    renderChart({ series: unequalObservations, label: 'Full formatting', formatX, formatY });
    const details = screen.getByRole('region', { name: 'Details for Full formatting' });
    expect(within(details).getByText(`Full recorded UTC timestamp ${firstDate}`)).toBeVisible();
    expect(within(details).getByText('Full measured observation 2 degrees')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show data table for Full formatting' }));
    const table = screen.getByRole('table', { name: 'Data for Full formatting' });
    expect(
      within(table).getByRole('rowheader', {
        name: `Full recorded UTC timestamp ${firstDate + 2 * day}`,
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('cell', { name: 'Full measured observation 30 degrees' }),
    ).toBeVisible();
    expect(table.textContent).not.toContain('…');
  });

  it('keeps two charts inspection and disclosure independent and omits a meaningless singleton range', () => {
    const view = render(
      <>
        <PharoLineChart series={unequalObservations} label="First independent inspection" />
        <PharoLineChart series={unequalObservations} label="Second independent inspection" />
        <PharoLineChart
          series={[{ id: 'one', label: 'One', points: [{ x: firstDate, y: 7 }] }]}
          label="Singleton inspection"
        />
      </>,
    );
    measure(view.container);
    fireEvent.change(screen.getByRole('slider', { name: 'Inspect First independent inspection' }), {
      target: { value: '3' },
    });
    expect(
      screen.getByRole('slider', { name: 'Inspect Second independent inspection' }),
    ).toHaveValue('0');
    expect(
      screen.queryByRole('slider', { name: 'Inspect Singleton inspection' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Details for Singleton inspection' })).getByText(
        '7',
        { exact: true },
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show data table for First independent inspection' }),
    );
    expect(
      screen.getByRole('table', { name: 'Data for First independent inspection' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'Data for Second independent inspection' }),
    ).not.toBeInTheDocument();
    const ids = [...view.container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
