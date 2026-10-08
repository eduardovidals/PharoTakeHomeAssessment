import { describe, expect, it } from 'vitest';
import { compactAxisLabel, prepareXLabels } from './utils';
import { formatDate } from '../../utils/chartData';
import type { ChartTick } from './types';

function ticks(width: number): readonly ChartTick[] {
  return Array.from({ length: 10 }, (_, index) => ({
    value: index,
    position: 56 + ((width - 72) * index) / 9,
  }));
}

describe('recorded axis label selection', () => {
  it('reserves the measured font width and gap instead of squeezing enlarged labels', () => {
    const candidates = ticks(500);
    const plot = { left: 56, right: 484 };

    const format = (value: number) => `Mar ${value + 10}`;

    const normal = prepareXLabels(candidates, format, plot);

    expect(prepareXLabels(candidates, format, plot, 12)).toEqual(normal);

    const enlarged = prepareXLabels(candidates, format, plot, 24);

    expect(enlarged.length).toBeLessThan(normal.length);
    expect(enlarged[0]?.value).toBe(0);
    expect(enlarged.at(-1)?.value).toBe(9);

    let occupied = -Infinity;

    for (const label of enlarged) {
      const left =
        label.position -
        (label.anchor === 'middle' ? label.width / 2 : label.anchor === 'end' ? label.width : 0);

      expect(left).toBeGreaterThanOrEqual(plot.left);
      expect(left).toBeGreaterThanOrEqual(occupied + 16);
      expect(left + label.width).toBeLessThanOrEqual(plot.right);
      expect(label.label).toBe(format(label.value));
      expect(label.position).toBe(candidates.find((tick) => tick.value === label.value)?.position);

      occupied = left + label.width;
    }

    const long = 'Full observed temperature';

    expect(compactAxisLabel(long, 100, 24).length).toBeLessThan(compactAxisLabel(long, 100).length);
    expect(compactAxisLabel(long, 100, 24)).toContain('…');
  });

  it('retains endpoints when they fit and restores more candidates as measured width grows', () => {
    const format = (value: number) => `Mar ${value + 10}`;

    const narrow = prepareXLabels(ticks(248), format, { left: 56, right: 232 });
    const wide = prepareXLabels(ticks(1200), format, { left: 56, right: 1184 });

    expect(narrow.map((tick) => tick.value)).toContain(0);
    expect(narrow.at(-1)?.value).toBe(9);
    expect(narrow.length).toBeLessThan(wide.length);
    expect(wide).toHaveLength(10);

    for (const labels of [narrow, wide]) {
      let occupied = -Infinity;

      for (const label of labels) {
        const left =
          label.position -
          (label.anchor === 'middle' ? label.width / 2 : label.anchor === 'end' ? label.width : 0);

        expect(left).toBeGreaterThanOrEqual(occupied + 8);

        occupied = left + label.width;
      }
    }
  });

  it('uses one shortened readable label instead of forcing overlapping endpoints into tiny space', () => {
    const result = prepareXLabels(ticks(112), () => 'Wednesday March 10, 2024', {
      left: 56,
      right: 96,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.width).toBeLessThanOrEqual(40);
    expect(result[0]?.label).toBe('Wednesday March 10, 2024');
    expect(result[0]?.text).toContain('…');
    expect(prepareXLabels(ticks(80), String, { left: 56, right: 64 })).toEqual([]);
  });

  it('keeps empty, identical and clustered candidate labels within the plot', () => {
    expect(prepareXLabels([], String, { left: 0, right: 100 })).toEqual([]);

    const duplicate = prepareXLabels(
      [
        { value: 1, position: 0 },
        { value: 2, position: 100 },
      ],
      () => 'Same',
      { left: 0, right: 100 },
    );

    expect(duplicate.map((tick) => tick.value)).toEqual([1]);

    const cluster = prepareXLabels(
      [
        { value: 1, position: 95 },
        { value: 2, position: 100 },
      ],
      (value) => `Mar ${value}`,
      { left: 0, right: 100 },
    );

    expect(cluster).toHaveLength(1);
    expect(cluster[0]?.anchor).toBe('end');
    expect(
      prepareXLabels([{ value: 1, position: 50 }], () => 'Mar 1', { left: 0, right: 100 })[0]
        ?.anchor,
    ).toBe('middle');
  });

  it('keeps exact extended and low-year UTC dates in the independent generic default', () => {
    expect(formatDate(Date.parse('0001-01-01T00:00:00Z'))).toBe('0001-01-01');
    expect(formatDate(Date.parse('+010000-01-01T00:00:00Z'))).toBe('+010000-01-01');
  });

  it('fits long singleton and interior endpoint labels to anchor space without moving dates', () => {
    for (const candidates of [
      [{ value: 1, position: 30 }],
      [
        { value: 1, position: 30 },
        { value: 2, position: 70 },
      ],
      [
        { value: 1, position: 5 },
        { value: 2, position: 95 },
      ],
    ]) {
      const labels = prepareXLabels(candidates, (value) => `Wednesday March ${value}, 2024`, {
        left: 0,
        right: 100,
      });

      expect(labels.length).toBeGreaterThan(0);

      for (const label of labels) {
        const left =
          label.position -
          (label.anchor === 'middle' ? label.width / 2 : label.anchor === 'end' ? label.width : 0);

        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + label.width).toBeLessThanOrEqual(100);
        expect(label.position).toBe(
          candidates.find((tick) => tick.value === label.value)?.position,
        );
        expect(label.label).toContain('Wednesday March');
      }
    }
  });
});
