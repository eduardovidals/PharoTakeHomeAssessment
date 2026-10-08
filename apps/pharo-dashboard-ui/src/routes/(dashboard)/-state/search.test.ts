import { describe, expect, test } from 'vitest';
import {
  addSelectedTicker,
  applyDashboardAction,
  getEffectiveChartMode,
  setDashboardView,
  clearSelectedTickers,
  getSelectedTickers,
  getSelectionNotice,
  parseDashboardSearch,
  removeSelectedTicker,
  stringifyDashboardSearch,
  validateDashboardSearch,
} from './search';

describe('the comma-separated selection contract', () => {
  test.each([
    ['', [], undefined],
    ['?tickers=', [], undefined],
    ['?tickers=%20%20', [], 'invalid'],
    ['?unrelated=AAA', [], undefined],
    ['?tickers=AAA', ['AAA'], undefined],
    ['?tickers=%20aaa%20,BBB,aaa', ['AAA', 'BBB'], 'normalized'],
    ['?tickers=AAA,,bad%2Fvalue,BBB', ['AAA', 'BBB'], 'normalized'],
    ['?tickers=AAA,BBB,CCC,DDD,AAA', ['AAA', 'BBB', 'CCC'], 'limit'],
    ['?tickers=UNKNOWN', ['UNKNOWN'], undefined],
    ['?tickers=123', ['123'], undefined],
    ['?tickers=true', ['TRUE'], 'normalized'],
    ['?tickers=null', ['NULL'], 'normalized'],
    ['?tickers=A.B,A_B,A-B', ['A.B', 'A_B', 'A-B'], undefined],
    ['?tickers=AAA&tickers=BBB', [], 'invalid'],
    ['?tickers=%5B%22AAA%22%5D', [], 'invalid'],
    ['?tickers=%7B%22ticker%22%3A%22AAA%22%7D', [], 'invalid'],
    ['?tickers=%E0%A4%A', [], 'invalid'],
    ['?tickers=%ZZ', [], 'invalid'],
    ['?tickers=%3Cscript%3E', [], 'invalid'],
    ['?tickers=%C3%9F', [], 'invalid'],
    ['?tickers=%C4%B1', [], 'invalid'],
  ])('validates %s without another selection owner', (raw, tickers, noticeKind) => {
    if (typeof raw !== 'string') throw new Error('Expected raw URL fixture');
    const search = validateDashboardSearch(parseDashboardSearch(raw));

    expect(getSelectedTickers(search)).toEqual(tickers);
    expect(getSelectionNotice(raw)?.kind).toBe(noticeKind);

    const canonical = stringifyDashboardSearch({ ...search });
    const reparsed = validateDashboardSearch(parseDashboardSearch(canonical));

    expect(reparsed).toEqual(search);
    expect(stringifyDashboardSearch({ ...reparsed })).toBe(canonical);
    expect(getSelectionNotice(canonical)).toBeUndefined();
  });

  test.each([
    null,
    undefined,
    123,
    true,
    [],
    { tickers: 123 },
    { tickers: ['AAA'] },
    { tickers: {} },
  ])('fails safely for a directly supplied nonstring value %j', (input) =>
    expect(validateDashboardSearch(input)).toEqual({}),
  );

  test('retains raw strings while rejecting repeated parameters and unrelated fields', () => {
    expect(parseDashboardSearch('?tickers=123')).toEqual({ tickers: '123' });
    expect(parseDashboardSearch('?tickers=TRUE')).toEqual({ tickers: 'TRUE' });
    expect(parseDashboardSearch('?tickers=AAA&tickers=BBB')).toEqual({ tickers: ['AAA', 'BBB'] });
    expect(stringifyDashboardSearch({ tickers: ' aaa,BBB ', ignored: 'secret' })).toBe(
      '?tickers=AAA%2CBBB',
    );
    expect(stringifyDashboardSearch({ tickers: '' })).toBe('');
  });

  test('adds, removes and clears without mutation, reordering, silent eviction or fake defaults', () => {
    const original = Object.freeze({ tickers: 'AAA,BBB' });

    expect(addSelectedTicker(original, ' ccc ')).toEqual({
      search: { tickers: 'AAA,BBB,CCC' },
      outcome: 'added',
    });
    expect(addSelectedTicker(original, ' aaa ')).toEqual({
      search: original,
      outcome: 'already-selected',
    });

    const full = Object.freeze({ tickers: 'AAA,BBB,CCC' });

    expect(addSelectedTicker(full, 'DDD')).toEqual({ search: full, outcome: 'limit' });
    expect(removeSelectedTicker(full, ' bbb ')).toEqual({ tickers: 'AAA,CCC' });
    expect(removeSelectedTicker({ tickers: 'AAA' }, 'AAA')).toEqual({});
    expect(removeSelectedTicker(original, 'UNKNOWN')).toEqual(original);
    expect(clearSelectedTickers()).toEqual({});
    expect(original).toEqual({ tickers: 'AAA,BBB' });
    expect(() => addSelectedTicker(original, 'bad/value')).toThrow(TypeError);
    expect(() => removeSelectedTicker(original, '')).toThrow(TypeError);
  });

  test('does not echo malformed link input in its fixed notice', () => {
    expect(getSelectionNotice('?tickers=%3Cscript%3Eprivate')).toEqual({
      kind: 'invalid',
      message: "The link's instrument selection is invalid.",
    });
  });
});

describe('independent explicit chart view and route intentions', () => {
  test.each([
    ['', {}, 'price', undefined],
    ['?tickers=AAA', { tickers: 'AAA' }, 'price', undefined],
    ['?tickers=AAA,UNKNOWN', { tickers: 'AAA,UNKNOWN' }, 'performance', undefined],
    ['?tickers=AAA,BBB,CCC', { tickers: 'AAA,BBB,CCC' }, 'performance', undefined],
    ['?view=performance', { view: 'performance' }, 'performance', undefined],
    ['?tickers=AAA,BBB&view=price', { tickers: 'AAA,BBB', view: 'price' }, 'price', undefined],
    ['?tickers=bad%2Fvalue&view=performance', { view: 'performance' }, 'performance', 'invalid'],
    ['?tickers=AAA&view=PRICE', { tickers: 'AAA' }, 'price', 'invalid'],
    ['?tickers=AAA,BBB&view=', { tickers: 'AAA,BBB' }, 'performance', 'invalid'],
    ['?tickers=AAA&view=%20price%20', { tickers: 'AAA' }, 'price', 'invalid'],
    ['?view=price&view=price', {}, 'price', 'invalid'],
    ['?view=price&view=performance', {}, 'price', 'invalid'],
    ['?view=%3Cscript%3Eprivate', {}, 'price', 'invalid'],
  ])('validates and round-trips %s independently', (raw, expected, mode, notice) => {
    if (typeof raw !== 'string') throw new Error('Expected raw URL fixture.');
    const search = validateDashboardSearch(parseDashboardSearch(raw));

    expect(search).toEqual(expected);
    expect(getEffectiveChartMode(search)).toBe(mode);
    expect(getSelectionNotice(raw)?.kind).toBe(notice);

    const encoded = stringifyDashboardSearch({ ...search });

    expect(validateDashboardSearch(parseDashboardSearch(encoded))).toEqual(search);
    expect(getSelectionNotice(encoded)).toBeUndefined();
  });

  test.each([null, false, true, 123, [], ['price'], {}, 'Price', '', ' price', 'price '])(
    'rejects view %j while retaining valid tickers',
    (view) => {
      expect(validateDashboardSearch({ tickers: 'AAA', view })).toEqual({ tickers: 'AAA' });
    },
  );

  test('keeps valid view despite invalid ticker types and omits derived defaults', () => {
    expect(validateDashboardSearch({ tickers: ['AAA'], view: 'price' })).toEqual({ view: 'price' });
    expect(parseDashboardSearch('?tickers=AAA&view=price&view=performance')).toEqual({
      tickers: 'AAA',
      view: ['price', 'performance'],
    });
    expect(stringifyDashboardSearch({ tickers: 'AAA,BBB' })).toBe('?tickers=AAA%2CBBB');
    expect(stringifyDashboardSearch({ tickers: ' aaa ', view: 'price', ignored: 'private' })).toBe(
      '?tickers=AAA&view=price',
    );
    expect(stringifyDashboardSearch({ view: 'performance' })).toBe('?view=performance');
  });

  test('gives deterministic safe notices without echoing either rejected field', () => {
    expect(getSelectionNotice('?tickers=AAA,BBB,CCC,DDD&view=hostile')).toEqual({
      kind: 'limit',
      message: 'Only the first three instruments in this link are selected.',
    });
    expect(getSelectionNotice('?tickers=aaa&view=hostile')).toEqual({
      kind: 'invalid',
      message: "The link's chart view is invalid.",
    });
    expect(getSelectionNotice('?tickers=bad%2Fvalue&view=hostile')).toEqual({
      kind: 'invalid',
      message: "The link's instrument selection is invalid.",
    });
  });

  test.each(['price', 'performance'] as const)(
    'preserves explicit %s through add/remove-last, until Clear',
    (view) => {
      const initial = Object.freeze({ tickers: 'AAA', view });
      const added = addSelectedTicker(initial, 'BBB');

      expect(added).toEqual({ search: { tickers: 'AAA,BBB', view }, outcome: 'added' });
      expect(removeSelectedTicker(added.search, 'AAA')).toEqual({ tickers: 'BBB', view });
      expect(removeSelectedTicker(initial, 'AAA')).toEqual({ view });
      expect(
        applyDashboardAction(initial, { type: 'remove', tickers: ['AAA', 'UNKNOWN'] }),
      ).toEqual({ search: { view }, outcome: 'committed' });
      expect(applyDashboardAction({ view }, { type: 'clear' })).toEqual({
        search: {},
        outcome: 'committed',
      });
      expect(applyDashboardAction({}, { type: 'clear' })).toEqual({
        search: {},
        outcome: 'unchanged',
      });
      expect(initial).toEqual({ tickers: 'AAA', view });
    },
  );

  test('writes an explicit derived choice, while duplicate/cap/removal no-ops retain all state', () => {
    expect(applyDashboardAction({}, { type: 'set-view', view: 'price' })).toEqual({
      search: { view: 'price' },
      outcome: 'committed',
    });

    const full = Object.freeze({ tickers: 'AAA,BBB,CCC', view: 'price' as const });

    expect(applyDashboardAction(full, { type: 'set-view', view: 'price' })).toEqual({
      search: full,
      outcome: 'unchanged',
    });
    expect(applyDashboardAction(full, { type: 'add', ticker: 'AAA' })).toEqual({
      search: full,
      outcome: 'unchanged',
    });
    expect(applyDashboardAction(full, { type: 'add', ticker: 'DDD' })).toEqual({
      search: full,
      outcome: 'limit',
    });
    expect(applyDashboardAction(full, { type: 'remove', tickers: ['UNKNOWN'] })).toEqual({
      search: full,
      outcome: 'unchanged',
    });
    expect(applyDashboardAction(full, { type: 'remove', tickers: ['BBB', 'AAA', 'AAA'] })).toEqual({
      search: { tickers: 'CCC', view: 'price' },
      outcome: 'committed',
    });
    // @ts-expect-error Runtime callers cannot serialize arbitrary view values.
    expect(() => setDashboardView(full, 'invalid')).toThrow(TypeError);
    // @ts-expect-error Runtime callers cannot submit unsupported intentions.
    expect(() => applyDashboardAction(full, { type: 'replace' })).toThrow(TypeError);
  });
});
