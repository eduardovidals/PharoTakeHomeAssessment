import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PharoChartInspection } from './PharoChartInspection';

it('uses the complete spoken date, exact recorded callbacks and canonical machine date without live spam', () => {
  const onInspect = vi.fn();
  const view = render(
    <PharoChartInspection
      label="Sensor readings"
      timeline={[0, 86_400_000]}
      timestamp={86_400_000}
      date="Jan 2"
      valueText="Friday, January 2, 1970; Sensor: unavailable"
      details={[{ id: 's', label: 'Sensor', kind: 'missing', value: null, display: 'Unavailable' }]}
      onInspect={onInspect}
    />,
  );
  const slider = screen.getByRole('slider', { name: 'Inspect Sensor readings' });
  expect(slider).toHaveValue('1');
  expect(slider).toHaveAccessibleDescription(/Home and End/);
  expect(slider).toHaveAttribute('aria-valuetext', 'Friday, January 2, 1970; Sensor: unavailable');
  expect(screen.getByText('Jan 2')).toHaveAttribute('datetime', '1970-01-02T00:00:00.000Z');
  fireEvent.change(slider, { target: { value: '0' } });
  expect(onInspect).toHaveBeenCalledExactlyOnceWith(0);
  expect(view.container.querySelector('[aria-live]')).toBeNull();
});

it('keeps singleton values readable without an inert range control', () => {
  render(
    <PharoChartInspection
      label="Single sample"
      timeline={[0]}
      timestamp={0}
      date="Jan 1"
      valueText="January 1, 1970; Sensor: 5"
      details={[{ id: 's', label: 'Sensor', kind: 'available', value: 5, display: '5' }]}
      onInspect={vi.fn()}
    />,
  );
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Details for Single sample' })).toHaveTextContent(
    'Sensor5',
  );
});
