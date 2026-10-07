import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { createApiClient } from '../../../../api/client';
import type { ApiClient } from '../../../../api/types';
import { priceStatsKey, priceStatsQueryOptions } from '../../../../api/prices';
import type { PriceStats } from '../../../../api/prices';
import { createAppQueryClient } from '../../../../app/queryClient';
import { server } from '../../../../test/mocks/server';
import { InstrumentStatistics } from './InstrumentStatistics';

const base = 'http://localhost/api';

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized.');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function Harness(props: { readonly client: ApiClient; readonly ticker: string }) {
  const query = useQuery(priceStatsQueryOptions(props.client, props.ticker));
  return <InstrumentStatistics ticker={props.ticker} query={query} />;
}

async function withStatistics(
  run: (owner: { cache: QueryClient; show: (ticker: string) => void }) => Promise<void>,
) {
  const cache = createAppQueryClient();
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retryDelay: 0 } });
  const client = createApiClient({ baseURL: base });
  const view = render(
    <QueryClientProvider client={cache}>
      <Harness client={client} ticker="A" />
    </QueryClientProvider>,
  );
  const failures: unknown[] = [];
  try {
    await run({
      cache,
      show: (ticker) =>
        view.rerender(
          <QueryClientProvider client={cache}>
            <Harness client={client} ticker={ticker} />
          </QueryClientProvider>,
        ),
    });
  } catch (error) {
    failures.push(error);
  }
  for (const release of [() => view.unmount(), () => cache.cancelQueries(), () => cache.clear()]) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Statistics test and cleanup failed.');
}

function definition(region: HTMLElement, label: string) {
  const term = within(region).getByText(label, { exact: true });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement) || value.tagName !== 'DD')
    throw new Error('Expected an associated definition value.');
  return value;
}

describe('InstrumentStatistics', () => {
  test.each([
    { returned: 12.3456, expected: '+12.35%' },
    { returned: -12.3456, expected: '-12.35%' },
    { returned: 0, expected: '0.00%' },
  ])(
    'shows signed percentage points for return $returned without changing the cache',
    async ({ returned, expected }) => {
      const data = {
        totalReturnPercent: returned,
        dailyVolatilityPercent: 2.3456,
        maxDrawdownPercent: 4.5678,
      };
      let requests = 0;
      server.use(
        http.get(base + '/prices/A/stats', () => {
          requests += 1;
          return HttpResponse.json(data);
        }),
      );
      await withStatistics(async ({ cache }) => {
        const region = screen.getByRole('region', { name: 'A statistics' });
        await within(region).findByText(expected, { exact: true });
        expect(
          within(definition(region, 'Total return')).getByText(expected, { exact: true }),
        ).toBeVisible();
        expect(
          within(definition(region, 'Daily volatility')).getByText('2.35%', { exact: true }),
        ).toBeVisible();
        expect(
          within(definition(region, 'Maximum drawdown')).getByText('4.57%', { exact: true }),
        ).toBeVisible();
        expect(within(region).getByText('First to last observation')).toBeVisible();
        expect(within(region).getByText('Sample deviation of daily returns')).toBeVisible();
        expect(within(region).getByText('Largest peak-to-trough decline')).toBeVisible();
        expect(cache.getQueryData<PriceStats>(priceStatsKey('A'))).toEqual(data);
        expect(requests).toBe(1);
      });
    },
  );

  test.each([
    { volatility: null, expected: 'Not enough observations' },
    { volatility: 0, expected: '0.00%' },
  ])(
    'distinguishes nullable volatility $volatility and preserves supplied drawdown sign',
    async ({ volatility, expected }) => {
      server.use(
        http.get(base + '/prices/A/stats', () =>
          HttpResponse.json({
            totalReturnPercent: 10,
            dailyVolatilityPercent: volatility,
            maxDrawdownPercent: -4.562,
          }),
        ),
      );
      await withStatistics(async () => {
        const region = screen.getByRole('region', { name: 'A statistics' });
        await within(region).findByText(expected, { exact: true });
        expect(
          within(definition(region, 'Daily volatility')).getByText(expected, { exact: true }),
        ).toBeVisible();
        expect(
          within(definition(region, 'Maximum drawdown')).getByText('-4.56%', { exact: true }),
        ).toBeVisible();
      });
    },
  );

  test('names pending statistics and recovers only the failed resource with safe output', async () => {
    const started = deferred();
    const release = deferred();
    const done = deferred();
    let requests = 0;
    server.use(
      http.get(base + '/prices/A/stats', async () => {
        requests += 1;
        if (requests > 1)
          return HttpResponse.json({
            totalReturnPercent: 1,
            dailyVolatilityPercent: null,
            maxDrawdownPercent: 0,
          });
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json({ raw: 'RAW_RESPONSE_SHOULD_NOT_APPEAR' }, { status: 404 });
        } finally {
          done.resolve();
        }
      }),
    );
    await withStatistics(async () => {
      try {
        await started.promise;
        expect(screen.getByRole('progressbar', { name: 'Loading A statistics' })).toBeVisible();
        expect(screen.queryByText('Total return', { exact: true })).not.toBeInTheDocument();
        release.resolve();
        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('Instrument not found.');
        expect(screen.queryByText(/RAW_RESPONSE/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Retry A statistics' }));
        await screen.findByText('+1.00%', { exact: true });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(requests).toBe(2);
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('keeps same-resource cached values visible when a later refetch fails', async () => {
    let requests = 0;
    server.use(
      http.get(base + '/prices/A/stats', () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({
              totalReturnPercent: 1.23456,
              dailyVolatilityPercent: 0,
              maxDrawdownPercent: 0,
            })
          : HttpResponse.json({ raw: 'PRIVATE_OWNED_FAILURE_MARKER' }, { status: 404 });
      }),
    );
    await withStatistics(async ({ cache }) => {
      await screen.findByText('+1.23%', { exact: true });
      await cache.refetchQueries({ queryKey: priceStatsKey('A') });
      await screen.findByRole('alert');
      expect(screen.getByText('+1.23%', { exact: true })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Retry A statistics' })).toBeVisible();
      expect(screen.queryByText(/PRIVATE_OWNED_FAILURE_MARKER/)).not.toBeInTheDocument();
      expect(requests).toBe(2);
    });
  });

  test('never relabels late A statistics as B after a current identity change', async () => {
    const started = deferred();
    const release = deferred();
    const done = deferred();
    server.use(
      http.get(base + '/prices/A/stats', async () => {
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json({
            totalReturnPercent: 11,
            dailyVolatilityPercent: 1,
            maxDrawdownPercent: 2,
          });
        } finally {
          done.resolve();
        }
      }),
      http.get(base + '/prices/B/stats', () =>
        HttpResponse.json({
          totalReturnPercent: 22,
          dailyVolatilityPercent: 2,
          maxDrawdownPercent: 3,
        }),
      ),
    );
    await withStatistics(async ({ show }) => {
      try {
        await started.promise;
        show('B');
        await screen.findByText('+22.00%', { exact: true });
        expect(screen.queryByRole('region', { name: 'A statistics' })).not.toBeInTheDocument();
        release.resolve();
        await done.promise;
        await waitFor(() =>
          expect(screen.getByRole('region', { name: 'B statistics' })).toHaveTextContent('+22.00%'),
        );
        expect(screen.queryByText('+11.00%', { exact: true })).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });
});
