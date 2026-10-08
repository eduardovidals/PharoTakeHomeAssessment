import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ComponentType, PropsWithChildren } from 'react';
import { expect, test } from 'vitest';
import { createAppQueryClient } from '../app/queryClient';
import { server } from '../test/mocks/server';
import { createApiClient } from './client';
import { InstrumentsApi } from './instruments';
import { PricesApi } from './prices';
import type { ApiClient } from './types';

const base = 'http://localhost/api';

function point(price: number) {
  return [{ date: '2024-03-10', price }];
}

const stats = { totalReturnPercent: 5, dailyVolatilityPercent: 2, maxDrawdownPercent: 1 };

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized.');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function withCache(
  run: (
    cache: QueryClient,
    client: ApiClient,
    wrapper: ComponentType<PropsWithChildren>,
  ) => Promise<void>,
) {
  const cache = createAppQueryClient();
  const client = createApiClient({ baseURL: base });
  // Keep the production retry decision; only eliminate elapsed retry backoff.
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retryDelay: 0 } });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );

  const failures: unknown[] = [];
  try {
    await run(cache, client, Wrapper);
  } catch (error) {
    failures.push(error);
  }

  try {
    await cache.cancelQueries();
  } catch (error) {
    failures.push(error);
  }

  try {
    cache.clear();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Query test and cleanup failed.');
}

test('uses the fixed dataset cache policy without polling or focus refetch', async () => {
  await withCache(async (cache) => {
    const options = cache.getDefaultOptions().queries;

    expect(options?.staleTime).toBe(Infinity);
    expect(options?.gcTime).toBe(1800000);
    expect(options?.refetchOnWindowFocus).toBe(false);
    expect(options?.refetchOnReconnect).toBe(false);
    expect(options?.refetchInterval).toBeFalsy();
  });
});

test('keeps zero, one and three ticker results ordered and reuses canonical cache keys', async () => {
  const requests: string[] = [];
  const prices = new Map([
    ['A', 11],
    ['B', 22],
    ['C', 33],
  ]);
  server.use(
    http.get(base + '/instruments', ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json(['A', 'B', 'C']);
    }),
    http.get(base + '/prices/:ticker', ({ params, request }) => {
      requests.push(new URL(request.url).pathname);
      const price = prices.get(String(params.ticker));
      if (price === undefined) throw new Error('Unexpected ticker in price handler.');

      return HttpResponse.json(point(price));
    }),
    http.get(base + '/prices/:ticker/stats', ({ params, request }) => {
      requests.push(new URL(request.url).pathname);
      const price = prices.get(String(params.ticker));
      if (price === undefined) throw new Error('Unexpected ticker in statistics handler.');

      return HttpResponse.json({ ...stats, totalReturnPercent: price });
    }),
  );
  await withCache(async (cache, client, wrapper) => {
    const initialTickers: readonly string[] = [];

    const view = renderHook(
      ({ tickers }: { readonly tickers: readonly string[] }) => ({
        instruments: InstrumentsApi.useGetInstruments(client),
        prices: PricesApi.useGetPrices(client, tickers),
        statistics: PricesApi.useGetPriceStats(client, tickers),
      }),
      { initialProps: { tickers: initialTickers }, wrapper },
    );
    try {
      await waitFor(() => expect(view.result.current.instruments.data).toEqual(['A', 'B', 'C']));
      expect(view.result.current.prices).toEqual([]);
      expect(view.result.current.statistics).toEqual([]);
      expect(requests).toEqual(['/api/instruments']);

      view.rerender({ tickers: [' a '] });

      await waitFor(() => {
        expect(view.result.current.prices.map((query) => query.data)).toEqual([point(11)]);
        expect(view.result.current.statistics.map((query) => query.data)).toEqual([
          { ...stats, totalReturnPercent: 11 },
        ]);
      });
      expect(requests).toHaveLength(3);

      view.rerender({ tickers: [' a ', 'B', 'C'] });

      await waitFor(() => {
        expect(view.result.current.prices.map((query) => query.data)).toEqual([
          point(11),
          point(22),
          point(33),
        ]);
        expect(
          view.result.current.statistics.map((query) => query.data?.totalReturnPercent),
        ).toEqual([11, 22, 33]);
      });
      expect(requests).toHaveLength(7);

      view.rerender({ tickers: ['C', 'A', 'B'] });

      await waitFor(() => {
        expect(view.result.current.prices.map((query) => query.data)).toEqual([
          point(33),
          point(11),
          point(22),
        ]);
        expect(
          view.result.current.statistics.map((query) => query.data?.totalReturnPercent),
        ).toEqual([33, 11, 22]);
      });
      expect(requests).toHaveLength(7);
      expect(
        cache
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ).toEqual(
        expect.arrayContaining([
          ['instruments'],
          ['prices', 'A'],
          ['prices', 'B'],
          ['prices', 'C'],
          ['price-stats', 'A'],
          ['price-stats', 'B'],
          ['price-stats', 'C'],
        ]),
      );
    } finally {
      view.unmount();
    }
  });
});

test('deduplicates concurrent service hooks for the same canonical ticker', async () => {
  let requests = 0;
  server.use(
    http.get(base + '/prices/A', () => {
      requests += 1;
      return HttpResponse.json(point(7));
    }),
  );
  await withCache(async (_cache, client, wrapper) => {
    const view = renderHook(
      () => ({
        first: PricesApi.useGetPrices(client, ['a']),
        second: PricesApi.useGetPrices(client, [' A ']),
      }),
      { wrapper },
    );
    try {
      await waitFor(() => {
        expect(view.result.current.first[0]?.data).toEqual(point(7));
        expect(view.result.current.second[0]?.data).toEqual(point(7));
      });
      expect(requests).toBe(1);
    } finally {
      view.unmount();
    }
  });
});

test('resolves peers and retries only failed stats while an independent history is held', async () => {
  const started = deferred();
  const release = deferred();
  const done = deferred();
  const requests: string[] = [];
  let failStatistics = true;
  server.use(
    http.get(base + '/prices/A', async ({ request }) => {
      requests.push(new URL(request.url).pathname);
      started.resolve();
      try {
        await release.promise;
        return HttpResponse.json(point(11));
      } finally {
        done.resolve();
      }
    }),
    http.get(base + '/prices/B', ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json(point(22));
    }),
    http.get(base + '/prices/:ticker/stats', ({ params, request }) => {
      requests.push(new URL(request.url).pathname);
      if (params.ticker === 'A' && failStatistics) {
        return HttpResponse.json({ problem: true }, { status: 404 });
      }
      return HttpResponse.json(stats);
    }),
  );
  await withCache(async (cache, client, wrapper) => {
    const view = renderHook(
      () => ({
        prices: PricesApi.useGetPrices(client, ['A', 'B']),
        statistics: PricesApi.useGetPriceStats(client, ['A', 'B']),
      }),
      { wrapper },
    );
    try {
      await started.promise;

      await waitFor(() => {
        expect(view.result.current.prices[1]?.data).toEqual(point(22));
        expect(view.result.current.statistics[0]?.error).toMatchObject({ kind: 'not-found' });
        expect(view.result.current.statistics[1]?.data).toEqual(stats);
      });
      expect(view.result.current.prices[0]?.isLoading).toBe(true);
      expect(cache.getQueryState(['prices', 'A'])?.fetchStatus).toBe('fetching');
      expect(requests).toHaveLength(4);

      failStatistics = false;
      await act(async () => {
        await view.result.current.statistics[0]?.refetch();
      });

      await waitFor(() => expect(view.result.current.statistics[0]?.data).toEqual(stats));
      expect(requests).toHaveLength(5);
      expect(requests.filter((path) => path === '/api/prices/A/stats')).toHaveLength(2);
      expect(view.result.current.prices[0]?.isLoading).toBe(true);
      expect(view.result.current.prices[1]?.data).toEqual(point(22));
      expect(view.result.current.statistics[1]?.data).toEqual(stats);

      release.resolve();

      await waitFor(() => expect(view.result.current.prices[0]?.data).toEqual(point(11)));
    } finally {
      view.unmount();
      await cache.cancelQueries();
      release.resolve();
      await done.promise;
    }
  });
});

test.each(['network', 'timeout', 'server'])(
  'bounds exhausted %s failures to three transport attempts',
  async (kind) => {
    let requests = 0;
    const releases: ReturnType<typeof deferred>[] = [];
    const settled: Promise<void>[] = [];
    server.use(
      http.get(base + '/prices/A', async () => {
        requests += 1;
        if (kind === 'network') return HttpResponse.error();
        if (kind === 'server') return HttpResponse.json({ problem: true }, { status: 503 });
        const release = deferred();
        const done = deferred();
        releases.push(release);
        settled.push(done.promise);
        try {
          await release.promise;
          return HttpResponse.json(point(1));
        } finally {
          done.resolve();
        }
      }),
    );
    try {
      await withCache(async (_cache, regularClient, wrapper) => {
        const client =
          kind === 'timeout' ? createApiClient({ baseURL: base, timeoutMs: 100 }) : regularClient;
        // The supported fetch adapter enforces the actual deadline while MSW holds its response.
        if (kind === 'timeout') client.defaults.adapter = 'fetch';

        const view = renderHook(() => PricesApi.useGetPrices(client, ['A']), { wrapper });
        try {
          await waitFor(() => {
            expect(view.result.current[0]?.isError).toBe(true);
            expect(view.result.current[0]?.error).toMatchObject({
              kind: kind === 'server' ? 'http' : kind,
            });
          });
          expect(requests).toBe(3);
        } finally {
          view.unmount();
        }
      });
    } finally {
      for (const release of releases) release.resolve();
      await Promise.all(settled);
    }
  },
);

test.each(['missing', 'forbidden', 'schema'])('does not retry %s failures', async (kind) => {
  let requests = 0;
  server.use(
    http.get(base + '/prices/A', () => {
      requests += 1;
      if (kind === 'schema') return HttpResponse.json([{ date: '2024-03-10', price: 0 }]);
      return HttpResponse.json({ problem: true }, { status: kind === 'missing' ? 404 : 403 });
    }),
  );
  await withCache(async (_cache, client, wrapper) => {
    const view = renderHook(() => PricesApi.useGetPrices(client, ['A']), { wrapper });
    try {
      await waitFor(() => {
        expect(view.result.current[0]?.isError).toBe(true);
        expect(view.result.current[0]?.error).toMatchObject({
          kind: kind === 'missing' ? 'not-found' : kind === 'schema' ? 'invalid-response' : 'http',
        });
      });
      expect(requests).toBe(1);
    } finally {
      view.unmount();
    }
  });
});

test('consumes the Query signal and cancels a held resource on hook unmount without retry', async () => {
  const started = deferred();
  const release = deferred();
  const done = deferred();
  let requests = 0;
  let aborted = false;
  let sawSignal = false;
  server.use(
    http.get(base + '/prices/A', async () => {
      requests += 1;
      started.resolve();
      try {
        await release.promise;
        return HttpResponse.json(point(11));
      } finally {
        done.resolve();
      }
    }),
  );
  await withCache(async (cache, client, wrapper) => {
    const detach: (() => void)[] = [];
    const interceptor = client.interceptors.request.use((config) => {
      const onAbort = () => {
        aborted = true;
      };
      sawSignal = config.signal !== undefined;
      config.signal?.addEventListener?.('abort', onAbort, { once: true });
      detach.push(() => config.signal?.removeEventListener?.('abort', onAbort));
      return config;
    });
    const view = renderHook(() => PricesApi.useGetPrices(client, ['A']), { wrapper });
    try {
      await started.promise;

      expect(sawSignal).toBe(true);
      expect(view.result.current[0]?.fetchStatus).toBe('fetching');

      view.unmount();

      await waitFor(() => expect(aborted).toBe(true));
      expect(requests).toBe(1);
      expect(cache.getQueryState(['prices', 'A'])?.fetchStatus).toBe('idle');
    } finally {
      view.unmount();
      await cache.cancelQueries();
      release.resolve();
      await done.promise;
      client.interceptors.request.eject(interceptor);
      for (const remove of detach) remove();
    }
  });
});

interface PriceWitnessProps {
  readonly ticker: string;
  readonly client: ApiClient;
}

function PriceWitness(props: PriceWitnessProps) {
  const { ticker, client } = props;
  const [query] = PricesApi.useGetPrices(client, [ticker]);
  return (
    <section>
      <h2>{ticker}</h2>
      <output aria-label={'History for ' + ticker}>
        {query?.isPending
          ? 'Loading'
          : (query?.data?.[0]?.price ?? query?.error?.kind ?? 'Unavailable')}
      </output>
    </section>
  );
}

test('never displays a late A response beneath B after a real observer change', async () => {
  const started = deferred();
  const release = deferred();
  const done = deferred();
  server.use(
    http.get(base + '/prices/A', async () => {
      started.resolve();
      try {
        await release.promise;
        return HttpResponse.json(point(11));
      } finally {
        done.resolve();
      }
    }),
    http.get(base + '/prices/B', () => HttpResponse.json(point(42))),
  );
  await withCache(async (cache, client) => {
    const view = render(
      <QueryClientProvider client={cache}>
        <PriceWitness ticker="A" client={client} />
      </QueryClientProvider>,
    );
    try {
      await started.promise;
      view.rerender(
        <QueryClientProvider client={cache}>
          <PriceWitness ticker="B" client={client} />
        </QueryClientProvider>,
      );

      await waitFor(() => expect(view.getByLabelText('History for B')).toHaveTextContent('42'));

      release.resolve();
      await done.promise;

      expect(view.getByRole('heading', { name: 'B' })).toBeVisible();
      expect(view.queryByLabelText('History for A')).not.toBeInTheDocument();
      expect(view.getByLabelText('History for B')).toHaveTextContent('42');
      expect(cache.getQueryData(['prices', 'A'])).toBeUndefined();
      expect(cache.getQueryData(['prices', 'B'])).toEqual(point(42));
    } finally {
      view.unmount();
      await cache.cancelQueries();
      release.resolve();
      await done.promise;
    }
  });
});
