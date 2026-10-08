import { describe, expect, it } from 'vitest';
import { allocateSeriesAppearances, appearanceConfiguration } from './utils';
import type { SeriesAppearanceState } from './types';

const empty: SeriesAppearanceState = { configuration: '[]', active: new Map(), history: new Map() };

describe('shared series appearance allocation', () => {
  it('retains survivors through removal and reorder without mutating any caller metadata', () => {
    const ids = Object.freeze(['AAA', 'BBB', 'CCC']);
    const first = allocateSeriesAppearances(empty, ids);

    expect([...first.active]).toEqual([
      ['AAA', 'primary'],
      ['BBB', 'secondary'],
      ['CCC', 'tertiary'],
    ]);

    const removed = allocateSeriesAppearances(first, ['BBB', 'CCC']);
    const reordered = allocateSeriesAppearances(removed, ['CCC', 'BBB']);

    expect([...reordered.active]).toEqual([
      ['CCC', 'tertiary'],
      ['BBB', 'secondary'],
    ]);
    expect([...first.active]).toEqual([
      ['AAA', 'primary'],
      ['BBB', 'secondary'],
      ['CCC', 'tertiary'],
    ]);
    expect(empty.active.size).toBe(0);
    expect(empty.history.size).toBe(0);
    expect(ids).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('reuses historical slots only when free, preserving current owners when IDs return', () => {
    const first = allocateSeriesAppearances(empty, ['AAA', 'BBB', 'CCC']);
    const removed = allocateSeriesAppearances(first, ['BBB', 'CCC']);

    expect(allocateSeriesAppearances(removed, ['BBB', 'CCC', 'AAA']).active.get('AAA')).toBe(
      'primary',
    );

    const replaced = allocateSeriesAppearances(removed, ['BBB', 'CCC', 'DDD']);
    const freed = allocateSeriesAppearances(replaced, ['CCC', 'DDD']);
    const returned = allocateSeriesAppearances(freed, ['CCC', 'DDD', 'AAA']);

    expect([...returned.active]).toEqual([
      ['CCC', 'tertiary'],
      ['DDD', 'primary'],
      ['AAA', 'secondary'],
    ]);

    const cleared = allocateSeriesAppearances(returned, []);

    expect(cleared.active.size).toBe(0);
    expect(allocateSeriesAppearances(cleared, ['AAA']).active.get('AAA')).toBe('secondary');
    expect(first.history.get('AAA')).toBe('primary');
  });

  it.each([
    { ids: ['AAA', 'AAA'] },
    { ids: ['AAA', 'BBB', 'CCC', 'DDD'] },
    { ids: [''] },
    { ids: ['   '] },
    { ids: Array<string>(1) },
  ])('rejects invalid canonical input $ids rather than duplicate a slot', ({ ids }) => {
    expect(() => appearanceConfiguration(ids)).toThrow(TypeError);
  });
});
