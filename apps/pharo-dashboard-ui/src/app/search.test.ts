import { describe, expect, test } from 'vitest';
import {
  addSelectedTicker,
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
