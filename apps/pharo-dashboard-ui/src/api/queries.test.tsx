import { QueryClientProvider, QueryObserver, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { expect, test } from 'vitest';
import { createAppQueryClient } from '../app/queryClient';
import { server } from '../test/mocks/server';
import { createApiClient } from './client';
import { instrumentsQueryOptions } from './instruments';
import { pricesQueryOptions, priceStatsQueryOptions } from './prices';
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

async function withCache(run: (cache: QueryClient, client: ApiClient) => Promise<void>) {
  const cache = createAppQueryClient();
  const client = createApiClient({ baseURL: base });
  // Keep the production retry decision; only eliminate elapsed retry backoff.
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retryDelay: 0 } });
  const failures: unknown[] = [];
  try {
    await run(cache, client);
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

test('runs independent resources concurrently and reuses canonical cache keys', async () => {
  const requests: string[] = [];
  server.use(
    http.get(base + '/instruments', ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json(['A', 'B']);
    }),
    http.get(base + '/prices/:ticker', ({ params, request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json(point(params.ticker === 'A' ? 11 : 22));
    }),
    http.get(base + '/prices/:ticker/stats', ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json(stats);
    }),
  );
  await withCache(async (cache, client) => {
    const values = await Promise.all([
      cache.fetchQuery(instrumentsQueryOptions(client)),
      cache.fetchQuery(pricesQueryOptions(client, ' a ')),
      cache.fetchQuery(pricesQueryOptions(client, 'B')),
      cache.fetchQuery(priceStatsQueryOptions(client, 'A')),
      cache.fetchQuery(priceStatsQueryOptions(client, 'B')),
    ]);

    expect(values).toEqual([['A', 'B'], point(11), point(22), stats, stats]);
    expect(requests).toHaveLength(5);

    await cache.fetchQuery(pricesQueryOptions(client, 'A'));
    await cache.fetchQuery(instrumentsQueryOptions(client));

    expect(requests).toHaveLength(5);
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
        ['price-stats', 'A'],
        ['price-stats', 'B'],
      ]),
    );
  });
});

test('deduplicates concurrent requests for the same canonical ticker', async () => {
  let requests = 0;
  server.use(
    http.get(base + '/prices/A', () => {
      requests += 1;
      return HttpResponse.json(point(7));
    }),
  );
  await withCache(async (cache, client) => {
    const values = await Promise.all([
      cache.fetchQuery(pricesQueryOptions(client, 'a')),
      cache.fetchQuery(pricesQueryOptions(client, ' A ')),
    ]);

    expect(values).toEqual([point(7), point(7)]);
    expect(requests).toBe(1);
  });
});

test('resolves B while an independent A history is still held', async () => {
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
    http.get(base + '/prices/B', () => HttpResponse.json(point(22))),
  );
  await withCache(async (cache, client) => {
    const first = cache.fetchQuery(pricesQueryOptions(client, 'A'));
    const second = cache.fetchQuery(pricesQueryOptions(client, 'B'));
    try {
      await started.promise;

      await expect(second).resolves.toEqual(point(22));
      expect(cache.getQueryState(['prices', 'A'])?.fetchStatus).toBe('fetching');

      release.resolve();

      await expect(first).resolves.toEqual(point(11));
    } finally {
      release.resolve();
      await done.promise;
      await Promise.allSettled([first, second]);
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
      await withCache(async (cache, regularClient) => {
        const client =
          kind === 'timeout' ? createApiClient({ baseURL: base, timeoutMs: 100 }) : regularClient;
        // The supported fetch adapter enforces the actual deadline while MSW holds its response.
        if (kind === 'timeout') client.defaults.adapter = 'fetch';

        await expect(cache.fetchQuery(pricesQueryOptions(client, 'A'))).rejects.toMatchObject({
          kind: kind === 'server' ? 'http' : kind,
        });
        expect(requests).toBe(3);
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
  await withCache(async (cache, client) => {
    await expect(cache.fetchQuery(pricesQueryOptions(client, 'A'))).rejects.toMatchObject({
      kind: kind === 'missing' ? 'not-found' : kind === 'schema' ? 'invalid-response' : 'http',
    });
    expect(requests).toBe(1);
  });
});

test('consumes the Query signal and cancels an inactive held resource without retry', async () => {
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
  await withCache(async (cache, client) => {
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
    const observer = new QueryObserver(cache, pricesQueryOptions(client, 'A'));
    const states: string[] = [];
    const unsubscribe = observer.subscribe((result) => {
      states.push(result.fetchStatus);
    });
    try {
      await started.promise;

      expect(sawSignal).toBe(true);

      unsubscribe();

      await waitFor(() => expect(aborted).toBe(true));
      expect(requests).toBe(1);
      expect(cache.getQueryState(['prices', 'A'])?.fetchStatus).toBe('idle');
      expect(states).toContain('fetching');
    } finally {
      unsubscribe();
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
  const query = useQuery(pricesQueryOptions(client, ticker));
  return (
    <section>
      <h2>{ticker}</h2>
      <output aria-label={'History for ' + ticker}>
        {query.isPending
          ? 'Loading'
          : (query.data?.[0]?.price ?? query.error?.kind ?? 'Unavailable')}
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
