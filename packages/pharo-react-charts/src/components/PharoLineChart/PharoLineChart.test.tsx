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
  it('reflows axis typography without replacing the chart or the chosen observation', async () => {
    const view = renderChart({
      series: observations,
      label: 'Larger text',
      xAxisLabel: 'Date (UTC)',
      yAxisLabel: 'Degrees',
    });
    const chart = screen.getByRole('img', { name: 'Larger text' });
    const slider = screen.getByRole('slider', { name: 'Inspect Larger text' });

    fireEvent.change(slider, { target: { value: '0' } });

    const details = screen.getByRole('region', { name: 'Details for Larger text' });
    const chosenDetails = details.textContent;
    const measured = measuredContainer(view.container);
    const computed = document.createElement('div').style;

    computed.fontSize = '24px';

    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
      element === measured ? computed : getComputedStyle(element),
    );

    await act(async () => window.dispatchEvent(new Event('resize')));

    expect(screen.getByRole('img', { name: 'Larger text' })).toBe(chart);
    expect(chart.querySelector('clipPath rect')).toHaveAttribute('x', '112');
    expect(chart.querySelector('clipPath rect')).toHaveAttribute('y', '32');
    expect(slider).toHaveValue('0');
    expect(details.textContent).toBe(chosenDetails);
    expect(chart.querySelector('[textLength]')).toBeNull();
  });

  it('adds a quiet baseline without changing recorded inspection and removes it on omission', () => {
    const input = Object.freeze([
      Object.freeze({
        id: 'level',
        label: 'Level',
        points: Object.freeze([
          Object.freeze({ x: firstDate, y: 10 }),
          Object.freeze({ x: firstDate + day, y: 20 }),
        ]),
      }),
    ]);
    const view = renderChart({ series: input, label: 'Referenced levels' });
    const chart = screen.getByRole('img', { name: 'Referenced levels' });
    const path = seriesGroup(chart, 'level').querySelector('path');

    expect(chart.querySelector('[data-chart-baseline]')).toBeNull();
    expect(path).toHaveAttribute('d', 'M56,272L656,16');

    fireEvent.change(screen.getByRole('slider', { name: 'Inspect Referenced levels' }), {
      target: { value: '0' },
    });
    view.rerender(<PharoLineChart series={input} label="Referenced levels" baselineY={0} />);

    const baseline = chart.querySelector('[data-chart-baseline]');

    expect(baseline).toHaveAttribute('data-chart-baseline', '0');
    expect(baseline).toHaveAttribute('x1', '56');
    expect(baseline).toHaveAttribute('x2', '656');
    expect(baseline).toHaveAttribute('y1', '272');
    expect(baseline).toHaveAttribute('y2', '272');
    expect(baseline).toHaveAttribute('aria-hidden', 'true');
    expect(baseline).toHaveClass('stroke-pharo-chart-baseline');
    expect(path).toHaveAttribute('d', 'M56,144L656,16');
    expect(path).toHaveClass('fill-none');

    const details = screen.getByRole('region', { name: 'Details for Referenced levels' });

    expect(within(details).getByText('10', { exact: true })).toBeVisible();

    view.rerender(<PharoLineChart series={input} label="Referenced levels" />);

    expect(screen.getByRole('img', { name: 'Referenced levels' })).toBe(chart);
    expect(chart.querySelector('[data-chart-baseline]')).toBeNull();
    expect(path).toHaveAttribute('d', 'M56,272L656,16');
    expect(within(details).getByText('10', { exact: true })).toBeVisible();
    expect(input[0]?.points).toEqual([
      { x: firstDate, y: 10 },
      { x: firstDate + day, y: 20 },
    ]);
  });

  it('keeps baseline-only empty data empty and fails safely for a nonfinite baseline', () => {
    const view = renderChart({ series: [], label: 'No measurements', baselineY: 0 });

    expect(screen.getByRole('status', { name: 'No measurements' })).toHaveTextContent(
      'No observations',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    view.rerender(<PharoLineChart series={observations} label="No measurements" baselineY={NaN} />);

    expect(screen.getByRole('status', { name: 'No measurements' })).toHaveTextContent(
      'Chart data is invalid.',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

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

    expect(dates).toContain('Mar 10');
    expect(dates).toContain('Mar 12');
    expect(dates).not.toContain('Mar 9');
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
      formatXDetail: (timestamp) => `Full date ${new Date(timestamp).toISOString().slice(0, 10)}`,
      formatXTable: (timestamp) => `Full date ${new Date(timestamp).toISOString().slice(0, 10)}`,
      formatXAccessible: (timestamp) =>
        `Full date ${new Date(timestamp).toISOString().slice(0, 10)}`,
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

  it('keeps both endpoint dates readable at 184 pixels and restores the middle date when widened', () => {
    const view = renderChart({ series: observations, label: 'Narrow date labels' });
    const chart = screen.getByRole('img', { name: 'Narrow date labels' });

    const visibleDates = () => {
      const timeAxis = within(chart).getByLabelText('UTC time axis');

      return [...timeAxis.querySelectorAll('text title')].map((title) => title.textContent);
    };

    expect(visibleDates()).toEqual(['Mar 10', 'Mar 11', 'Mar 12']);

    measure(view.container, 184, 320);

    expect(visibleDates()).toEqual(['Mar 10', 'Mar 12']);
    expect(chart).toHaveAttribute('viewBox', '0 0 184 320');

    measure(view.container, 672, 320);

    expect(visibleDates()).toEqual(['Mar 10', 'Mar 11', 'Mar 12']);
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

    renderChart({
      series: observations,
      label: 'Custom labels',
      formatXAxis: formatX,
      formatYAxis: formatY,
    });

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
          formatXAxis={axis === 'x' ? formatter : undefined}
          formatYAxis={axis === 'y' ? formatter : undefined}
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
  it('follows latest arrivals only until a user explicitly selects a recorded date', () => {
    const first = [{ id: 'sensor', label: 'Sensor', points: [{ x: firstDate, y: 1 }] }];
    const second = [
      {
        ...first[0],
        id: 'sensor',
        label: 'Sensor',
        points: [
          { x: firstDate, y: 1 },
          { x: firstDate + day, y: 2 },
        ],
      },
    ];
    const view = renderChart({ series: first, label: 'Latest arrivals' });

    view.rerender(<PharoLineChart series={second} label="Latest arrivals" />);

    expect(screen.getByRole('slider', { name: 'Inspect Latest arrivals' })).toHaveValue('1');

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });

    const previous = second[0];

    if (!previous) throw new Error('Second fixture must exist.');

    view.rerender(
      <PharoLineChart
        series={[
          {
            id: 'sensor',
            label: 'Sensor',
            points: [...previous.points, { x: firstDate + 2 * day, y: 3 }],
          },
        ]}
        label="Latest arrivals"
        formatXDetail={() => 'Changed view'}
      />,
    );

    expect(screen.getByRole('slider')).toHaveValue('0');

    measure(view.container, 320, 240);

    expect(screen.getByRole('slider')).toHaveValue('0');
  });

  it('keeps axis, detail, table and spoken formatter contexts independent', () => {
    renderChart({
      series: observations,
      label: 'Seven formats',
      formatXAxis: () => 'Axis date',
      formatXDetail: () => 'Detail date',
      formatXTable: () => 'Table date',
      formatXAccessible: () => 'Complete spoken date',
      formatYAxis: (value) => `Axis ${value}`,
      formatYDetail: (value) => `Detail ${value}`,
      formatYTable: (value) => `Table ${value}`,
    });

    const chart = screen.getByRole('img', { name: 'Seven formats' });

    expect(within(chart).getByLabelText('UTC time axis')).toHaveTextContent('Axis date');
    expect(within(chart).getByLabelText('Value axis')).toHaveTextContent('Axis 10');
    expect(screen.getByRole('region', { name: 'Details for Seven formats' })).toHaveTextContent(
      'Detail date',
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Complete spoken date; Temperature: Detail 10',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show data table for Seven formats' }));

    const table = screen.getByRole('table', { name: 'Data for Seven formats' });

    expect(within(table).getAllByRole('rowheader')[0]).toHaveTextContent('Table date');
    expect(within(table).getAllByRole('rowheader')[0]).toHaveAccessibleName('Complete spoken date');
    expect(within(table).getByRole('cell', { name: 'Table 10' })).toBeVisible();
  });

  it('keeps external data access stable while an unrelated overlay masks the chart and trigger', async () => {
    const view = render(
      <>
        <button id="recorded-data" type="button">
          View recorded data
        </button>
        <PharoLineChart
          series={observations}
          label="External data"
          dataTable={{ mode: 'external', triggerId: 'recorded-data' }}
        />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'View recorded data' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 44));

    measure(view.container);

    const chart = screen.getByRole('img', { name: 'External data' });

    expect(chart).toHaveAttribute('aria-details', 'recorded-data');
    expect(screen.queryByText('Show data table')).not.toBeInTheDocument();

    // React Aria masks every background sibling while the instrument picker is open.
    const picker = document.createElement('div');

    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Choose instruments');
    await act(async () => {
      view.container.setAttribute('aria-hidden', 'true');
      view.container.setAttribute('inert', '');
      document.body.append(picker);
    });

    expect(chart).toHaveAttribute('aria-details', 'recorded-data');
    expect(screen.queryByText('Show data table')).not.toBeInTheDocument();

    await act(async () => {
      view.container.removeAttribute('aria-hidden');
      view.container.removeAttribute('inert');
      picker.remove();
    });

    expect(screen.getByRole('button', { name: 'View recorded data' })).toBeEnabled();
    expect(screen.queryByText('Show data table')).not.toBeInTheDocument();
  });

  it('uses inline access when the consumer withdraws its external data action', () => {
    const view = render(
      <>
        <button id="conditional-data" type="button">
          View recorded data
        </button>
        <PharoLineChart
          series={observations}
          label="Conditional data"
          dataTable={{ mode: 'external', triggerId: 'conditional-data' }}
        />
      </>,
    );

    measure(view.container);

    expect(screen.queryByText('Show data table')).not.toBeInTheDocument();

    view.rerender(
      <>
        {null}
        <PharoLineChart
          series={observations}
          label="Conditional data"
          dataTable={{ mode: 'inline' }}
        />
      </>,
    );

    expect(screen.getByRole('img', { name: 'Conditional data' })).not.toHaveAttribute(
      'aria-details',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show data table for Conditional data' }));

    expect(screen.getByRole('table', { name: 'Data for Conditional data' })).toBeVisible();
  });

  it('preserves an inline alternative for blank external IDs and all-null recorded rows', () => {
    renderChart({
      series: [{ id: 'empty', label: 'Null observations', points: [{ x: firstDate, y: null }] }],
      label: 'Recorded missing values',
      dataTable: { mode: 'external', triggerId: ' ' },
    });

    expect(screen.getByRole('status', { name: 'Recorded missing values' })).toHaveTextContent(
      'No observations',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show data table for Recorded missing values' }),
    );

    expect(
      screen.getByRole('table', { name: 'Data for Recorded missing values' }),
    ).toHaveTextContent('Unavailable');
    expect(screen.getByRole('rowheader', { name: '2024-03-10' })).toBeVisible();
  });

  it('names the native range and exposes exact values or unavailable without a pointer live region', () => {
    const view = renderChart({ series: unequalObservations, label: 'Unequal dates' });
    const slider = screen.getByRole('slider', { name: 'Inspect Unequal dates' });

    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveValue('3');
    expect(slider).toHaveAccessibleDescription();
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '2024-03-13; Sensor A: 8; Sensor B: Unavailable',
    );

    const inspection = view.container.querySelector('[data-chart-inspection]');

    expect(inspection).toHaveAttribute('aria-hidden', 'true');
    expect(inspection).toHaveAttribute('transform', 'translate(656 0)');
    expect(inspection?.querySelectorAll('circle')).toHaveLength(1);
    expect(inspection?.querySelector('[data-inspection-series-id="a"]')).toHaveAttribute(
      'transform',
      `translate(0 ${272 - (6 / 28) * 256})`,
    );
    expect(inspection?.querySelector('[data-inspection-series-id="b"]')).toBeNull();

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
    expect(inspection).toHaveAttribute('transform', 'translate(256 0)');
    expect(inspection?.querySelectorAll('circle')).toHaveLength(1);
    expect(inspection?.querySelector('[data-inspection-series-id="a"]')).toBeNull();
    expect(inspection?.querySelector('[data-inspection-series-id="b"]')).toHaveAttribute(
      'transform',
      `translate(0 ${272 - (18 / 28) * 256})`,
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

  it('keeps controlled hover temporary and navigation anchored to the committed date', () => {
    const onTimestampChange = vi.fn();
    const props = { series: unequalObservations, label: 'Pinned comparison', onTimestampChange };
    const view = renderChart({ ...props, selectedTimestamp: null });
    const chart = screen.getByRole('img', { name: props.label });

    mockScaledBounds(chart);

    const slider = screen.getByRole('slider', { name: 'Inspect Pinned comparison' });
    const details = screen.getByRole('region', { name: 'Details for Pinned comparison' });

    pointer(chart, 'pointermove', 128);

    expect(details).toHaveTextContent('2024-03-10');
    expect(slider).toHaveValue('3');
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '2024-03-13; Sensor A: 8; Sensor B: Unavailable',
    );
    expect(onTimestampChange).not.toHaveBeenCalled();

    pointer(chart, 'pointerout', 128);

    expect(details).toHaveTextContent('2024-03-13');

    pointer(chart, 'pointermove', 128);
    fireEvent.focus(slider);

    expect(details).toHaveTextContent('2024-03-13');

    fireEvent.change(slider, { target: { value: '2' } });

    expect(onTimestampChange).toHaveBeenLastCalledWith(firstDate + 2 * day);
    // A controlled consumer owns acceptance; a callback alone cannot alter its selected date.
    expect(slider).toHaveValue('3');

    view.rerender(<PharoLineChart {...props} selectedTimestamp={firstDate + 2 * day} />);

    expect(slider).toHaveValue('2');
    expect(details).toHaveTextContent('2024-03-12');

    pointer(chart, 'pointermove', 128);

    expect(slider).toHaveValue('2');
    expect(onTimestampChange).toHaveBeenCalledTimes(1);

    pointer(chart, 'pointerout', 128);

    expect(details).toHaveTextContent('2024-03-12');

    view.rerender(<PharoLineChart {...props} selectedTimestamp={null} />);

    expect(details).toHaveTextContent('2024-03-13');
    expect(onTimestampChange).toHaveBeenCalledTimes(1);

    pointer(chart, 'pointermove', 128);
    view.rerender(<PharoLineChart {...props} selectedTimestamp={firstDate + day} />);
    view.rerender(<PharoLineChart {...props} selectedTimestamp={null} />);

    expect(details).toHaveTextContent('2024-03-13');
  });

  it('commits mouse clicks and completed touch taps once, but not hover or scroll gestures', () => {
    const onTimestampChange = vi.fn();

    renderChart({
      series: unequalObservations,
      label: 'Committed interactions',
      selectedTimestamp: null,
      onTimestampChange,
    });

    const chart = screen.getByRole('img', { name: 'Committed interactions' });

    mockScaledBounds(chart);
    pointer(chart, 'pointermove', 328);

    expect(onTimestampChange).not.toHaveBeenCalled();

    pointer(chart, 'pointerdown', 328);
    pointer(chart, 'pointerup', 328);
    fireEvent.click(chart);

    expect(onTimestampChange).toHaveBeenCalledExactlyOnceWith(firstDate + 2 * day);

    pointer(chart, 'pointerdown', 128, 'touch');
    pointer(chart, 'pointerup', 128, 'touch');
    fireEvent.click(chart);

    expect(onTimestampChange.mock.calls).toEqual([[firstDate + 2 * day], [firstDate]]);

    pointer(chart, 'pointerdown', 228, 'touch');
    pointer(chart, 'pointermove', 228, 'touch', 140);
    pointer(chart, 'pointerup', 228, 'touch', 140);
    pointer(chart, 'pointerdown', 228, 'touch');
    pointer(chart, 'pointercancel', 228, 'touch');
    pointer(chart, 'pointerup', 228, 'touch');

    expect(onTimestampChange).toHaveBeenCalledTimes(2);
  });

  it('retains an unavailable controlled date through data updates without inventing a replacement commit', () => {
    const onTimestampChange = vi.fn();
    const props = {
      series: unequalObservations,
      label: 'Exact pin',
      selectedTimestamp: firstDate + 2 * day,
      onTimestampChange,
    };
    const view = renderChart(props);
    const withoutDate = unequalObservations.map((item) => ({
      ...item,
      points: item.points.filter((point) => point.x !== props.selectedTimestamp),
    }));

    view.rerender(<PharoLineChart {...props} series={withoutDate} />);

    const details = screen.getByRole('region', { name: 'Details for Exact pin' });

    expect(details).toHaveTextContent('2024-03-12');
    expect(within(details).getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByRole('slider', { name: 'Inspect Exact pin' })).toHaveValue('1');

    measure(view.container, 320, 272);

    expect(details).toHaveTextContent('2024-03-12');
    expect(onTimestampChange).not.toHaveBeenCalled();
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

      expect(screen.getByRole('slider', { name: 'Inspect Reset inspection' })).toHaveValue('3');
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

    renderChart({
      series: unequalObservations,
      label: 'Full formatting',
      formatXDetail: formatX,
      formatXTable: formatX,
      formatXAccessible: formatX,
      formatYDetail: formatY,
      formatYTable: formatY,
    });

    const details = screen.getByRole('region', { name: 'Details for Full formatting' });

    expect(
      within(details).getByText(`Full recorded UTC timestamp ${firstDate + 3 * day}`),
    ).toBeVisible();
    expect(within(details).getByText('Full measured observation 8 degrees')).toBeVisible();

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
    ).toHaveValue('3');
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
