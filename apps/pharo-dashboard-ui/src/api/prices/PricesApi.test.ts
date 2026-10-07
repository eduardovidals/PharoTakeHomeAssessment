import { HttpResponse, http } from 'msw';
import { expect, expectTypeOf, test } from 'vitest';
import { server } from '../../test/mocks/server';
import { createApiClient } from '../client';
import { getPrices, getPriceStats } from './PricesApi';
import { pricesKey, priceStatsKey } from './keys';
import { pricePointSchema, priceSeriesSchema, priceStatsSchema } from './schema';
import type { PricePoint, PriceSeries, PriceStats } from './types';

const base = 'http://localhost/api';
const client = () => createApiClient({ baseURL: base });
const history = [
  { date: '0001-01-01', price: 100.123456789 },
  { date: '0099-12-31', price: 101 },
  { date: '2024-02-29', price: 102 },
];
const statistics = {
  totalReturnPercent: 1.87654321,
  dailyVolatilityPercent: null,
  maxDrawdownPercent: 0,
};

test('requests canonical encoded history and stats paths with unrounded readonly data', async () => {
  const paths: string[] = [];
  server.use(
    http.get(base + '/prices/ABC.1_-', ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return HttpResponse.json(history);
    }),
    http.get(base + '/prices/ABC.1_-/stats', ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return HttpResponse.json(statistics);
    }),
  );
  const [prices, stats] = await Promise.all([
    getPrices(client(), ' abc.1_- '),
    getPriceStats(client(), 'abc.1_-'),
  ]);
  expect(paths.sort()).toEqual(['/api/prices/ABC.1_-', '/api/prices/ABC.1_-/stats']);
  expect(prices).toEqual(history);
  expect(stats).toEqual(statistics);
  expect(Object.isFrozen(prices)).toBe(true);
  expect(Object.isFrozen(prices[0])).toBe(true);
  expect(Object.isFrozen(stats)).toBe(true);
  expectTypeOf(prices).toEqualTypeOf<PriceSeries>();
  expectTypeOf(stats).toEqualTypeOf<PriceStats>();
  expectTypeOf<PricePoint>().toEqualTypeOf<Readonly<{ date: string; price: number }>>();
  expect(pricesKey(' abc ')).toEqual(['prices', 'ABC']);
  expect(priceStatsKey('abc')).toEqual(['price-stats', 'ABC']);
});

test.each([
  [{ date: '0000-01-01', price: 1 }],
  [{ date: '2024-02-30', price: 1 }],
  [{ date: '2023-02-29', price: 1 }],
  [{ date: '2024-1-01', price: 1 }],
  [{ date: '2024-01-01T00:00:00Z', price: 1 }],
  [{ date: '2024-01-01', price: 0 }],
  [{ date: '2024-01-01', price: -1 }],
  [{ date: '2024-01-01', price: '1' }],
  [{ date: '2024-01-01', price: 1, currency: 'USD' }],
  [
    { date: '2024-01-02', price: 2 },
    { date: '2024-01-01', price: 1 },
  ],
  [
    { date: '2024-01-01', price: 2 },
    { date: '2024-01-01', price: 1 },
  ],
])('rejects invalid historical JSON %#', async (...payload) => {
  server.use(http.get(base + '/prices/ABC', () => HttpResponse.json(payload)));
  await expect(getPrices(client(), 'ABC')).rejects.toMatchObject({ kind: 'invalid-response' });
});

test.each([NaN, Infinity, -Infinity])('rejects nonfinite numeric schema values %s', (value) => {
  expect(pricePointSchema.safeParse({ date: '2024-01-01', price: value }).success).toBe(false);
  expect(priceStatsSchema.safeParse({ ...statistics, totalReturnPercent: value }).success).toBe(
    false,
  );
  expect(priceStatsSchema.safeParse({ ...statistics, dailyVolatilityPercent: value }).success).toBe(
    false,
  );
  expect(priceStatsSchema.safeParse({ ...statistics, maxDrawdownPercent: value }).success).toBe(
    false,
  );
});

test.each([
  { totalReturnPercent: 1, maxDrawdownPercent: 2 },
  { ...statistics, dailyVolatilityPercent: '0' },
  { ...statistics, dailyVolatilityPercent: undefined },
  { ...statistics, totalReturnPercent: null },
  { ...statistics, maxDrawdownPercent: null },
  { ...statistics, extra: 'raw' },
])('rejects invalid statistic JSON %#', async (payload) => {
  server.use(http.get(base + '/prices/ABC/stats', () => HttpResponse.json(payload)));
  await expect(getPriceStats(client(), 'ABC')).rejects.toMatchObject({ kind: 'invalid-response' });
});

test('keeps generic history and numeric volatility independent of dataset counts', () => {
  expect(priceSeriesSchema.parse([])).toEqual([]);
  expect(priceSeriesSchema.parse([history[0]])).toHaveLength(1);
  expect(priceStatsSchema.parse({ ...statistics, dailyVolatilityPercent: 2.123456789 })).toEqual({
    ...statistics,
    dailyVolatilityPercent: 2.123456789,
  });
});

test.each(['bad space', '$BAD', '', 'A'.repeat(33), 'ß'])(
  'rejects programming ticker %s before I/O',
  (ticker) => {
    expect(() => getPrices(client(), ticker)).toThrow('Invalid instrument identifier.');
    expect(() => getPriceStats(client(), ticker)).toThrow(TypeError);
    expect(() => pricesKey(ticker)).toThrow(TypeError);
    expect(() => priceStatsKey(ticker)).toThrow(TypeError);
  },
);

test('keeps both unknown resource errors as actual404 failures', async () => {
  server.use(
    http.get(base + '/prices/MISSING', () =>
      HttpResponse.json({ detail: 'secret' }, { status: 404 }),
    ),
    http.get(base + '/prices/MISSING/stats', () =>
      HttpResponse.json({ detail: 'secret' }, { status: 404 }),
    ),
  );
  await Promise.all(
    [getPrices(client(), 'missing'), getPriceStats(client(), 'missing')].map((outcome) =>
      expect(outcome).rejects.toEqual({
        kind: 'not-found',
        status: 404,
        message: 'Instrument not found.',
      }),
    ),
  );
});

test('forwards cancellation for both resource functions without an empty success', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(getPrices(client(), 'ABC', controller.signal)).rejects.toMatchObject({
    kind: 'cancelled',
  });
  await expect(getPriceStats(client(), 'ABC', controller.signal)).rejects.toMatchObject({
    kind: 'cancelled',
  });
});
