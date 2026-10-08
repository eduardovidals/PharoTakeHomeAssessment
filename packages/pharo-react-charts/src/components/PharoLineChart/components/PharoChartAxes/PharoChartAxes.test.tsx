import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { prepareChartGeometry } from '../../geometry';
import { prepareXLabels } from '../../utils';
import { PharoChartAxes } from './PharoChartAxes';

it('places enlarged labels within scaled gutters and preserves their full descriptions', () => {
  const geometry = prepareChartGeometry(
    [
      {
        id: 'sensor',
        label: 'Sensor',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 20 },
        ],
      },
    ],
    320,
    320,
    [0, 100],
    undefined,
    24,
  );
  if (geometry.kind !== 'ready') throw new Error('Expected usable enlarged geometry.');
  const xLabels = prepareXLabels(geometry.xTicks, (value) => `Day ${value}`, geometry.plot, 24);
  render(
    <svg role="img" aria-label="Enlarged axes">
      <PharoChartAxes
        geometry={geometry}
        xLabels={xLabels}
        formatYAxis={String}
        xAxisLabel="Recorded UTC dates"
        yAxisLabel="Temperature in degrees"
      />
    </svg>,
  );
  const svg = screen.getByRole('img', { name: 'Enlarged axes' });
  expect(svg.firstElementChild).toHaveAttribute('font-size', '24');
  expect(
    within(svg).getByRole('group', { name: 'UTC time axis' }).querySelector('text'),
  ).toHaveAttribute('y', '264');
  const labels = [...svg.querySelectorAll('text')];
  const yTitle = labels.find(
    (element) => element.querySelector('title')?.textContent === 'Temperature in degrees',
  );
  const xTitle = labels.find(
    (element) => element.querySelector('title')?.textContent === 'Recorded UTC dates',
  );
  expect(yTitle).toHaveAttribute('y', '24');
  expect(xTitle).toHaveAttribute('y', '304');
  expect(yTitle).toHaveTextContent('Temperature in degrees');
  expect(svg.querySelector('[textLength]')).toBeNull();
});

it('renders prepared UTC coordinates and keeps complete numerical titles without squeezed text', () => {
  const geometry = prepareChartGeometry(
    [
      {
        id: 'sensor',
        label: 'Sensor',
        points: [
          { x: 0, y: 10 },
          { x: 100, y: 20 },
        ],
      },
    ],
    320,
    240,
    [0, 100],
  );
  if (geometry.kind !== 'ready') throw new Error('Fixture must produce usable geometry.');
  const xLabels = prepareXLabels(geometry.xTicks, (value) => `Day ${value}`, geometry.plot);
  render(
    <svg role="img" aria-label="Axes">
      <PharoChartAxes
        geometry={geometry}
        xLabels={xLabels}
        formatYAxis={(value) => `Complete recorded value ${value}`}
      />
    </svg>,
  );
  const svg = screen.getByRole('img', { name: 'Axes' });
  const x = within(svg).getByRole('group', { name: 'UTC time axis' });
  expect([...x.querySelectorAll('text')].map((node) => node.getAttribute('x'))).toEqual([
    '56',
    '304',
  ]);
  expect(within(svg).getByRole('group', { name: 'Value axis' })).toHaveTextContent(
    'Complete recorded value 10',
  );
  expect(svg.querySelector('[textLength]')).toBeNull();
});
