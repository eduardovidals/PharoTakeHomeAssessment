import { describe, expect, it } from 'vitest';
import { selectionActions, validateSelectionLimit } from './utils';

describe('multiple selection adaptation', () => {
  it('preserves filtered and unknown keys while mapping additions and visible removals', () => {
    expect(selectionActions(['unknown', 7], [8], [7, 8])).toEqual([
      { kind: 'add', key: 8 },
      { kind: 'remove', keys: [7] },
    ]);
    expect(selectionActions(['unknown'], [], [7])).toEqual([]);
    expect(selectionActions([7, 'a'], ['a', 7], [7, 'a'])).toEqual([]);
    expect(selectionActions([], [7, 7, 'foreign'], [7])).toEqual([{ kind: 'add', key: 7 }]);
  });
  it('accepts an optional positive integer and rejects unusable runtime limits', () => {
    expect(() => validateSelectionLimit(undefined)).not.toThrow();
    expect(() => validateSelectionLimit(4)).not.toThrow();
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateSelectionLimit(limit)).toThrow(RangeError);
    }
  });
});
