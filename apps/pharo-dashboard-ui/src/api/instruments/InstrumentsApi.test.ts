import { HttpResponse, http } from 'msw';
import { expect, expectTypeOf, test } from 'vitest';
import { server } from '../../test/mocks/server';
import { createApiClient } from '../client';
import { getInstruments } from './InstrumentsApi';
import { instrumentsKey } from './keys';
import { canonicalTickerSchema, instrumentsSchema, normalizeTicker } from './schema';
import type { Instruments } from './types';

const endpoint = 'http://localhost/api/instruments';

const client = () => createApiClient({ baseURL: 'http://localhost/api' });

test.each([
  [' abc.1 ', 'ABC.1'],
  ['123', '123'],
  ['true', 'TRUE'],
  ['null', 'NULL'],
  ['a_b-2', 'A_B-2'],
])('normalizes request identifiers %s', (value, expected) => {
  expect(normalizeTicker(value)).toBe(expected);
});

test.each([
  undefined,
  null,
  123,
  ['A'],
  {},
  '',
  'bad space',
  '$BAD',
  'A'.repeat(33),
  'ß',
  'ı',
  'ſ',
])('rejects invalid or non-ASCII identifier %#', (value) => {
  expect(normalizeTicker(value)).toBeUndefined();
});

test('validates canonical response bytes without transforming server identifiers', () => {
  expect(canonicalTickerSchema.safeParse('ABC.1').success).toBe(true);
  expect(canonicalTickerSchema.safeParse('abc.1').success).toBe(false);
  expect(canonicalTickerSchema.safeParse(' ABC.1 ').success).toBe(false);
});

test('retrieves the exact sorted instruments route and readonly data', async () => {
  let requests = 0;
  server.use(
    http.get(endpoint, () => {
      requests += 1;
      return HttpResponse.json(['123', 'ABC.1', 'TRUE']);
    }),
  );
  const result = await getInstruments(client());

  expect(result).toEqual(['123', 'ABC.1', 'TRUE']);
  expect(requests).toBe(1);
  expect(Object.isFrozen(result)).toBe(true);

  expectTypeOf(result).toEqualTypeOf<Instruments>();
  expectTypeOf(result).toEqualTypeOf<readonly string[]>();

  expect(instrumentsKey).toEqual(['instruments']);
});

test.for([['ABC', 'abc'], ['ABC', 'ABC'], ['B', 'A'], [' ABC'], ['$ABC'], { tickers: ['ABC'] }])(
  'rejects incorrect instrument response %#',
  async (payload) => {
    server.use(http.get(endpoint, () => HttpResponse.json(payload)));

    await expect(getInstruments(client())).rejects.toMatchObject({ kind: 'invalid-response' });
  },
);

test('does not turn the supplied dataset size into a generic schema restriction', () => {
  expect(instrumentsSchema.parse([])).toEqual([]);
  expect(instrumentsSchema.parse(['ONLY'])).toEqual(['ONLY']);
});

test('forwards an already aborted signal without requesting the collection', async () => {
  let requests = 0;
  server.use(
    http.get(endpoint, () => {
      requests += 1;
      return HttpResponse.json(['ABC']);
    }),
  );
  const controller = new AbortController();
  controller.abort();

  await expect(getInstruments(client(), controller.signal)).rejects.toEqual({
    kind: 'cancelled',
    message: 'Request cancelled.',
  });
  expect(requests).toBe(0);
});
