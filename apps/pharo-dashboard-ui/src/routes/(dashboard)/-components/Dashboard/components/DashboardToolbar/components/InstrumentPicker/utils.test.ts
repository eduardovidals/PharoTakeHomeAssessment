import { describe, expect, test } from 'vitest';
import { rankInstruments, toDashboardAction } from './utils';

describe('instrument option ranking and route intention adaptation', () => {
  test('ranks exact, prefix and contains by canonical ordinal key without mutating the list', () => {
    const tickers = ['ZA', 'AB', 'BA', 'AA', 'A', 'OTHER'];

    expect(rankInstruments(tickers, '  a  ').map((item) => item.ticker)).toEqual([
      'A',
      'AA',
      'AB',
      'BA',
      'ZA',
    ]);
    expect(tickers).toEqual(['ZA', 'AB', 'BA', 'AA', 'A', 'OTHER']);
    expect(rankInstruments(tickers, '').map((item) => item.ticker)).toEqual([
      'A',
      'AA',
      'AB',
      'BA',
      'OTHER',
      'ZA',
    ]);
    expect(rankInstruments(tickers, 'missing')).toEqual([]);
  });

  test('does not truncate candidates to a page', () => {
    const tickers = Array.from(
      { length: 200 },
      (_, index) => `TICK${String(index + 1).padStart(4, '0')}`,
    );

    expect(rankInstruments(tickers, '')).toHaveLength(200);
    expect(rankInstruments(tickers, '').at(-1)).toEqual({ ticker: 'TICK0200' });
  });

  test('accepts only known exact string additions while unknown committed tags remain removable', () => {
    expect(toDashboardAction({ kind: 'add', key: 'A' }, ['A'])).toEqual({
      type: 'add',
      ticker: 'A',
    });
    expect(toDashboardAction({ kind: 'add', key: 'UNKNOWN' }, ['A'])).toBeUndefined();
    expect(toDashboardAction({ kind: 'add', key: 123 }, ['123'])).toBeUndefined();
    expect(toDashboardAction({ kind: 'remove', keys: ['UNKNOWN', '123'] }, [])).toEqual({
      type: 'remove',
      tickers: ['UNKNOWN', '123'],
    });
    expect(toDashboardAction({ kind: 'remove', keys: ['A', 123] }, ['A'])).toBeUndefined();
    expect(toDashboardAction({ kind: 'clear' }, [])).toEqual({ type: 'clear' });
  });
});
