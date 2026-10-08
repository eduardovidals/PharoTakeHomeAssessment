import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { prepareChartGeometry } from '../../geometry';
import { prepareXLabels } from '../../utils';
import { PharoChartAxes } from './PharoChartAxes';

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
  const x = within(svg).getByLabelText('UTC time axis');
  expect([...x.querySelectorAll('text')].map((node) => node.getAttribute('x'))).toEqual([
    '56',
    '304',
  ]);
  expect(within(svg).getByLabelText('Value axis')).toHaveTextContent('Complete recorded value 10');
  expect(svg.querySelector('[textLength]')).toBeNull();
});
