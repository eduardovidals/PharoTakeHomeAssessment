import { StrictMode, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartResizeObserver } from '../../../test/setup';
import { useChartSize } from './useChartSize';

interface MeasurementHarnessProps {
  nodeKey?: string;
  name?: string;
  committed?: () => void;
}

function MeasurementHarness(props: MeasurementHarnessProps) {
  const { nodeKey = 'initial', name = 'Measured area', committed } = props;
  const { ref, width, height } = useChartSize();
  useEffect(() => {
    committed?.();
  });
  return (
    <div key={nodeKey} ref={ref} aria-label={name}>
      <output aria-label={`${name} size`}>
        {width} × {height}
      </output>
    </div>
  );
}

function observerFor(element: Element) {
  const observer = ChartResizeObserver.instances.find((candidate) =>
    candidate.targets.has(element),
  );
  if (!observer) throw new Error('No active observer owns the rendered element.');
  return observer;
}

describe('useChartSize', () => {
  it('observes its actual element and commits only changed measurements', () => {
    const committed = vi.fn();
    render(<MeasurementHarness committed={committed} />);
    const element = screen.getByLabelText('Measured area');
    const observer = observerFor(element);
    expect(observer.observe).toHaveBeenCalledWith(element);
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('0 × 0');
    act(() => observer.deliver(element, 672, 320));
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('672 × 320');
    committed.mockClear();
    act(() => {
      observer.deliver(element, 672, 320);
      observer.deliver(element, 672, 320);
    });
    expect(committed).not.toHaveBeenCalled();
    act(() => observer.deliver(element, 372, 192));
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('372 × 192');
    expect(committed).toHaveBeenCalledTimes(1);
  });

  it('ignores a delivery for another element instead of borrowing its size', () => {
    render(<MeasurementHarness />);
    const element = screen.getByLabelText('Measured area');
    const observer = observerFor(element);
    act(() => observer.deliver(document.createElement('div'), 900, 500));
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('0 × 0');
  });

  it('disconnects before replacing a node and ignores an old callback after replacement', () => {
    const view = render(<MeasurementHarness />);
    const oldElement = screen.getByLabelText('Measured area');
    const oldObserver = observerFor(oldElement);
    act(() => oldObserver.deliver(oldElement, 672, 320));
    view.rerender(<MeasurementHarness nodeKey="replacement" />);
    const newElement = screen.getByLabelText('Measured area');
    const newObserver = observerFor(newElement);
    expect(newElement).not.toBe(oldElement);
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(oldObserver.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      newObserver.observe.mock.invocationCallOrder[0] ?? 0,
    );
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('0 × 0');
    act(() => newObserver.deliver(newElement, 372, 192));
    act(() => oldObserver.deliver(oldElement, 999, 999));
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('372 × 192');
  });

  it('retires an unmounted owner without disconnecting or changing a second instance', () => {
    const retired = render(<MeasurementHarness name="First" />);
    render(<MeasurementHarness name="Second" />);
    const first = screen.getByLabelText('First');
    const second = screen.getByLabelText('Second');
    const firstObserver = observerFor(first);
    const secondObserver = observerFor(second);
    act(() => {
      firstObserver.deliver(first, 672, 320);
      secondObserver.deliver(second, 372, 192);
    });
    retired.unmount();
    expect(firstObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(secondObserver.disconnect).not.toHaveBeenCalled();
    act(() => firstObserver.deliver(first, 999, 999));
    expect(screen.queryByLabelText('First')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Second size')).toHaveTextContent('372 × 192');
    act(() => secondObserver.deliver(second, 400, 200));
    expect(screen.getByLabelText('Second size')).toHaveTextContent('400 × 200');
  });

  it('owns an active observer after StrictMode setup replay and releases every acquired observer', () => {
    const view = render(
      <StrictMode>
        <MeasurementHarness />
      </StrictMode>,
    );
    const element = screen.getByLabelText('Measured area');
    const active = observerFor(element);
    act(() => active.deliver(element, 672, 320));
    expect(screen.getByLabelText('Measured area size')).toHaveTextContent('672 × 320');
    view.unmount();
    expect(ChartResizeObserver.instances.length).toBeGreaterThan(0);
    for (const observer of ChartResizeObserver.instances) {
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
      expect(observer.targets.size).toBe(0);
    }
  });
});
