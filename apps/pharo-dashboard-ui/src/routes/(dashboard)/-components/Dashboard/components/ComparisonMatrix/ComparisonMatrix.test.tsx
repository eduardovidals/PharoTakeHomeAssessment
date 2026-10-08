import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createApiClient } from '../../../../../../api/client';
import type { ApiClient } from '../../../../../../api/types';
import { PricesApi, pricesKey, priceStatsKey } from '../../../../../../api/prices';
import type { PriceStats } from '../../../../../../api/prices';
import { createAppQueryClient } from '../../../../../../app/queryClient';
import { server } from '../../../../../../test/mocks/server';
import { ComparisonMatrix } from './ComparisonMatrix';

const base = 'http://localhost/api';

const history = [
  { date: '2026-08-03', price: 100.123456 },
  { date: '2026-08-04', price: 110.255678 },
];

const stats = {
  totalReturnPercent: 1.23456,
  dailyVolatilityPercent: 2.3456,
  maxDrawdownPercent: 4.5678,
};

// jsdom has no layout. Supply geometry only; the actual matrix owns its observer
// and the browser checks native scrolling and sticky headers.
class MatrixResizeObserver implements ResizeObserver {
  static readonly active = new Set<MatrixResizeObserver>();
  readonly targets = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    MatrixResizeObserver.active.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    MatrixResizeObserver.active.delete(this);
  }
}

const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MatrixResizeObserver,
  });
});

afterAll(() => {
  if (resizeObserverDescriptor) {
    Object.defineProperty(globalThis, 'ResizeObserver', resizeObserverDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  }
});

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized.');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

interface HarnessProps {
  readonly selectedTimestamp?: number | null;
  readonly client: ApiClient;
  readonly tickers: readonly string[];
  readonly onRemove: (ticker: string) => Promise<void>;
}

function Harness(props: HarnessProps) {
  const prices = PricesApi.useGetPrices(props.client, props.tickers);

  const statistics = PricesApi.useGetPriceStats(props.client, props.tickers);

  const columns = props.tickers.flatMap((ticker, index) => {
    const historyQuery = prices[index];
    const statisticsQuery = statistics[index];
    return historyQuery && statisticsQuery
      ? [{ ticker, prices: historyQuery, statistics: statisticsQuery }]
      : [];
  });
  return (
    <>
      <button type="button">Elsewhere</button>
      <ComparisonMatrix
        columns={columns}
        onRemove={props.onRemove}
        selectedTimestamp={props.selectedTimestamp}
      />
    </>
  );
}

interface TestOwner {
  readonly pin: (timestamp: number | null) => void;
  readonly cache: QueryClient;
  readonly show: (tickers: readonly string[]) => void;
}

async function withMatrix(
  run: (owner: TestOwner) => Promise<void>,
  tickers: readonly string[] = ['A'],
  onRemove: (ticker: string) => Promise<void> = async () => undefined,
) {
  const cache = createAppQueryClient();
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retryDelay: 0 } });
  const client = createApiClient({ baseURL: base });

  const view = render(
    <QueryClientProvider client={cache}>
      <Harness client={client} tickers={tickers} onRemove={onRemove} />
    </QueryClientProvider>,
  );

  let selectedTimestamp: number | null = null;
  let currentTickers = tickers;
  const failures: unknown[] = [];
  try {
    await run({
      cache,
      pin: (timestamp) => {
        selectedTimestamp = timestamp;
        view.rerender(
          <QueryClientProvider client={cache}>
            <Harness
              client={client}
              tickers={currentTickers}
              onRemove={onRemove}
              selectedTimestamp={selectedTimestamp}
            />
          </QueryClientProvider>,
        );
      },
      show: (next) => {
        currentTickers = next;
        view.rerender(
          <QueryClientProvider client={cache}>
            <Harness
              client={client}
              tickers={next}
              onRemove={onRemove}
              selectedTimestamp={selectedTimestamp}
            />
          </QueryClientProvider>,
        );
      },
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
  if (failures.length > 1) throw new AggregateError(failures, 'Matrix test and cleanup failed.');
}

function metric(label: string, index = 0) {
  const row = within(screen.getByRole('table', { name: 'Comparison' }))
    .getByRole('rowheader', { name: label })
    .closest('tr');
  if (!row) throw new Error('Metric row is missing.');
  const value = within(row).getAllByRole('cell')[index];
  if (!value) throw new Error('Metric column is missing.');
  return value;
}

function defaultResponses() {
  server.use(
    http.get(base + '/prices/:ticker', () => HttpResponse.json(history)),
    http.get(base + '/prices/:ticker/stats', () => HttpResponse.json(stats)),
  );
}

describe('ComparisonMatrix', () => {
  test('describes hidden columns only while the native comparison table overflows', async () => {
    defaultResponses();
    await withMatrix(async () => {
      await waitFor(() => expect(metric('Latest close', 2)).toHaveTextContent('110.26'));

      const scroll = screen.getByRole('region', { name: 'Comparison table scroll area' });
      const table = screen.getByRole('table', { name: 'Comparison' });
      const observer = [...MatrixResizeObserver.active].find((owner) => owner.targets.has(scroll));
      if (!observer) throw new Error('Comparison resize owner is missing.');
      expect(observer.targets.has(table)).toBe(true);
      expect(scroll).not.toHaveAttribute('aria-describedby');

      Object.defineProperties(scroll, {
        clientWidth: { configurable: true, value: 290 },
        scrollWidth: { configurable: true, value: 440 },
      });
      act(() => observer.callback([], observer));

      expect(scroll).toHaveAccessibleDescription('3 instruments · Swipe or scroll to compare.');
      expect(screen.getByText(/3 instruments · Swipe or scroll to compare/)).toBeVisible();
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((cell) => cell.textContent),
      ).toEqual(['Metric', 'A', 'B', 'C']);
      expect(within(table).getAllByRole('rowheader')).toHaveLength(4);

      scroll.focus();

      expect(scroll).toHaveFocus();

      Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 440 });
      act(() => observer.callback([], observer));

      expect(screen.queryByText(/Swipe or scroll/)).not.toBeInTheDocument();
      expect(scroll).not.toHaveAttribute('aria-describedby');
    }, ['A', 'B', 'C']);

    expect(MatrixResizeObserver.active.size).toBe(0);
  });

  test.each([
    { returned: 12.3456, expected: '+12.35%' },
    { returned: -12.3456, expected: '-12.35%' },
    { returned: 0, expected: '0.00%' },
    { returned: -0.0001, expected: '0.00%' },
  ])(
    'shows signed percentage points $returned without changing raw resources',
    async ({ returned, expected }) => {
      defaultResponses();
      const data = { ...stats, totalReturnPercent: returned };
      let requests = 0;
      server.use(
        http.get(base + '/prices/A/stats', () => {
          requests += 1;
          return HttpResponse.json(data);
        }),
      );
      await withMatrix(async ({ cache }) => {
        await waitFor(() => expect(metric('Total return')).toHaveTextContent(expected));
        expect(metric('Latest close')).toHaveTextContent('110.26');
        expect(metric('Daily volatility')).toHaveTextContent('2.35%');
        expect(metric('Max drawdown')).toHaveTextContent('4.57%');
        expect(cache.getQueryData<PriceStats>(priceStatsKey('A'))).toEqual(data);
        expect(cache.getQueryData(pricesKey('A'))).toEqual(history);
        expect(requests).toBe(1);
        expect(screen.getByRole('table', { name: 'Comparison' })).toHaveAccessibleDescription(
          'Metrics cover each instrument’s full supplied window.',
        );

        await userEvent.click(screen.getByText('About these metrics'));

        expect(screen.getByText(/sample deviation of daily returns/)).toBeVisible();
      });
    },
  );

  test.each([
    { volatility: null, expected: 'Not enough observations' },
    { volatility: 0, expected: '0.00%' },
  ])(
    'distinguishes nullable volatility $volatility and preserves supplied drawdown sign',
    async ({ volatility, expected }) => {
      defaultResponses();
      server.use(
        http.get(base + '/prices/A/stats', () =>
          HttpResponse.json({
            ...stats,
            dailyVolatilityPercent: volatility,
            maxDrawdownPercent: -4.562,
          }),
        ),
      );
      await withMatrix(async () => {
        await waitFor(() => expect(metric('Daily volatility')).toHaveTextContent(expected));
        expect(metric('Max drawdown')).toHaveTextContent('-4.56%');
      });
    },
  );

  test('keeps URL column order and raw latest values with one semantic table', async () => {
    defaultResponses();
    await withMatrix(
      async ({ show }) => {
        await waitFor(() => expect(metric('Latest close', 2)).toHaveTextContent('110.26'));
        expect(
          within(screen.getByRole('table', { name: 'Comparison' }))
            .getAllByRole('columnheader')
            .map((header) => header.textContent),
        ).toEqual(['Metric', 'B', 'A', 'C']);

        show(['C']);

        await waitFor(() =>
          expect(
            within(screen.getByRole('table', { name: 'Comparison' })).getAllByRole('columnheader'),
          ).toHaveLength(2),
        );
        expect(metric('Latest close')).toHaveTextContent('110.26');
        expect(screen.queryByRole('group', { name: 'C resources' })).not.toBeInTheDocument();
      },
      ['B', 'A', 'C'],
    );
  });

  test('keeps all metric cells while independent initial resources are pending', async () => {
    const release = deferred();
    const done = deferred();
    defaultResponses();
    server.use(
      http.get(base + '/prices/A/stats', async () => {
        try {
          await release.promise;
          return HttpResponse.json(stats);
        } finally {
          done.resolve();
        }
      }),
    );
    await withMatrix(async () => {
      try {
        await waitFor(() => expect(metric('Latest close')).toHaveTextContent('110.26'));
        expect(metric('Total return')).toHaveTextContent('Loading…');
        expect(metric('Daily volatility')).toHaveTextContent('Loading…');
        expect(metric('Max drawdown')).toHaveTextContent('Loading…');
        expect(screen.getByRole('group', { name: 'A resources' })).toHaveTextContent(
          'Loading statistics…',
        );
        expect(screen.getAllByRole('status')).toHaveLength(1);

        release.resolve();

        await waitFor(() => expect(metric('Total return')).toHaveTextContent('+1.23%'));
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('404 offers one safe removal instead of retries and failed navigation is retryable', async () => {
    defaultResponses();
    server.use(
      http.get(base + '/prices/A', () =>
        HttpResponse.json({ raw: 'RAW_RESPONSE_SHOULD_NOT_APPEAR' }, { status: 404 }),
      ),
      http.get(base + '/prices/A/stats', () =>
        HttpResponse.json({ raw: 'RAW_RESPONSE_SHOULD_NOT_APPEAR' }, { status: 404 }),
      ),
    );
    const remove = vi
      .fn<(ticker: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('PRIVATE_NAVIGATION_FAILURE'))
      .mockResolvedValue(undefined);
    await withMatrix(
      async () => {
        const action = await screen.findByRole('button', { name: 'Remove A from comparison' });

        await waitFor(() => expect(metric('Total return')).toHaveTextContent('Unavailable'));
        expect(screen.getAllByText('Not in this dataset')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/RAW_RESPONSE/)).not.toBeInTheDocument();

        await userEvent.click(action);

        expect(screen.getByRole('status')).toHaveTextContent(
          'Unable to remove this instrument. Please try again.',
        );
        expect(screen.queryByText(/PRIVATE_NAVIGATION/)).not.toBeInTheDocument();

        await userEvent.click(action);

        expect(remove.mock.calls).toEqual([['A'], ['A']]);
        expect(screen.getByRole('status')).not.toHaveTextContent('Unable to remove');
      },
      ['A'],
      remove,
    );
  });

  test('recovers only failed statistics and preserves focus until the action disappears', async () => {
    defaultResponses();
    const release = deferred();
    const done = deferred();
    const requests = { prices: 0, statistics: 0, peer: 0 };
    server.use(
      http.get(base + '/prices/A', () => {
        requests.prices += 1;
        return HttpResponse.json(history);
      }),
      http.get(base + '/prices/B/stats', () => {
        requests.peer += 1;
        return HttpResponse.json(stats);
      }),
      http.get(base + '/prices/A/stats', async () => {
        requests.statistics += 1;
        if (requests.statistics <= 3)
          return HttpResponse.json({ raw: 'PRIVATE_FAILURE' }, { status: 503 });
        try {
          await release.promise;
          return HttpResponse.json(stats);
        } finally {
          done.resolve();
        }
      }),
    );
    await withMatrix(async () => {
      try {
        const button = await screen.findByRole('button', { name: 'Retry A statistics' });

        expect(metric('Latest close')).toHaveTextContent('110.26');
        expect(metric('Total return', 1)).toHaveTextContent('+1.23%');

        await userEvent.click(button);

        expect(await screen.findByRole('button', { name: 'Retrying A statistics' })).toHaveFocus();
        expect(button).toHaveAttribute('data-pending');
        expect(requests).toEqual({ prices: 1, statistics: 4, peer: 1 });

        release.resolve();

        await waitFor(() => expect(metric('Total return')).toHaveTextContent('+1.23%'));
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: /Retry.*A statistics/ }),
          ).not.toBeInTheDocument(),
        );
        expect(screen.getByRole('heading', { name: 'Comparison' })).toHaveFocus();
        expect(requests).toEqual({ prices: 1, statistics: 4, peer: 1 });
      } finally {
        release.resolve();
        await done.promise;
      }
    }, ['A', 'B']);
  });

  test('keeps cached values through failed refetch and manual retry without stealing moved focus', async () => {
    defaultResponses();
    const release = deferred();
    const done = deferred();
    let requests = 0;
    server.use(
      http.get(base + '/prices/A/stats', async () => {
        requests += 1;
        if (requests === 1) return HttpResponse.json(stats);
        if (requests <= 4)
          return HttpResponse.json({ raw: 'PRIVATE_OWNED_FAILURE_MARKER' }, { status: 503 });
        try {
          await release.promise;
          return HttpResponse.json({ ...stats, totalReturnPercent: 5 });
        } finally {
          done.resolve();
        }
      }),
    );
    await withMatrix(async ({ cache }) => {
      try {
        await waitFor(() => expect(metric('Total return')).toHaveTextContent('+1.23%'));

        await act(async () => {
          await cache.refetchQueries({ queryKey: priceStatsKey('A') });
        });

        const button = await screen.findByRole('button', { name: 'Retry A statistics' });

        expect(metric('Total return')).toHaveTextContent('+1.23%');

        await userEvent.click(button);

        expect(await screen.findByRole('button', { name: 'Retrying A statistics' })).toHaveFocus();
        expect(metric('Total return')).toHaveTextContent('+1.23%');
        expect(cache.getQueryState(priceStatsKey('A'))?.status).toBe('error');
        expect(cache.getQueryState(priceStatsKey('A'))?.fetchStatus).toBe('fetching');

        await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
        release.resolve();

        await waitFor(() => expect(metric('Total return')).toHaveTextContent('+5.00%'));
        expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
        expect(screen.queryByText(/PRIVATE_OWNED/)).not.toBeInTheDocument();
        expect(requests).toBe(5);
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('restores stable focus when a retry discovers a deterministic missing instrument', async () => {
    defaultResponses();
    let requests = 0;
    server.use(
      http.get(base + '/prices/A/stats', () => {
        requests += 1;
        return HttpResponse.json({}, { status: requests <= 3 ? 503 : 404 });
      }),
    );
    await withMatrix(async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Retry A statistics' }));

      expect(await screen.findByRole('button', { name: 'Remove A from comparison' })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Retry.*A statistics/ })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Comparison' })).toHaveFocus();
      expect(requests).toBe(4);
    });
  });

  test('never relabels obsolete A statistics as B after selected identity changes', async () => {
    defaultResponses();
    const started = deferred();
    const release = deferred();
    const done = deferred();
    // MSW's XHR bridge omits Request.signal; observe the actual transport abort instead.
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort');
    server.use(
      http.get(base + '/prices/A/stats', async () => {
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json({ ...stats, totalReturnPercent: 11 });
        } finally {
          done.resolve();
        }
      }),
      http.get(base + '/prices/B/stats', () =>
        HttpResponse.json({ ...stats, totalReturnPercent: 22 }),
      ),
    );
    await withMatrix(async ({ show }) => {
      try {
        await started.promise;

        await waitFor(() => expect(metric('Latest close')).toHaveTextContent('110.26'));

        show(['B']);

        await waitFor(() => expect(metric('Total return')).toHaveTextContent('+22.00%'));
        await waitFor(() => expect(abort).toHaveBeenCalledOnce());

        release.resolve();
        await done.promise;

        expect(screen.queryByRole('columnheader', { name: 'A' })).not.toBeInTheDocument();
        expect(screen.queryByText('+11.00%')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('empty histories remain unavailable while schema errors stay safe and non-retryable', async () => {
    defaultResponses();
    server.use(
      http.get(base + '/prices/A', () => HttpResponse.json([])),
      http.get(base + '/prices/A/stats', () => HttpResponse.json({ private: 'RAW_SCHEMA_MARKER' })),
    );
    await withMatrix(async () => {
      await waitFor(() => expect(metric('Total return')).toHaveTextContent('Unavailable'));
      expect(metric('Latest close')).toHaveTextContent('Unavailable');
      expect(screen.getByRole('group', { name: 'A resources' })).toHaveTextContent(
        'No recorded prices.',
      );
      expect(screen.queryByRole('button', { name: /Retry|Remove/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/RAW_SCHEMA/)).not.toBeInTheDocument();
    });
  });

  test('pins cached prefixes without new requests and restores independent Latest API statistics', async () => {
    defaultResponses();
    let requests = 0;
    server.use(
      http.get(base + '/prices/A', () => {
        requests += 1;
        return HttpResponse.json(history);
      }),
    );
    await withMatrix(async ({ pin, cache }) => {
      await waitFor(() => expect(metric('Total return')).toHaveTextContent('+1.23%'));

      pin(Date.parse('2026-08-03'));

      expect(metric('Closing price')).toHaveTextContent('100.12');
      expect(metric('Total return')).toHaveTextContent('0.00%');
      expect(metric('Daily volatility')).toHaveTextContent('Not enough observations');
      expect(metric('Max drawdown')).toHaveTextContent('0.00%');
      expect(screen.getByRole('table')).toHaveAccessibleDescription(
        /Pinned Aug 3, 2026.*inclusive.*1 observation/,
      );
      expect(screen.getByRole('status')).toHaveTextContent('Comparison pinned to Aug 3, 2026');

      pin(Date.parse('2026-08-04'));

      expect(metric('Closing price')).toHaveTextContent('110.26');
      expect(metric('Total return')).toHaveTextContent('+10.12%');
      expect(metric('Daily volatility')).toHaveTextContent('Not enough observations');

      pin(null);

      expect(metric('Total return')).toHaveTextContent('+1.23%');
      expect(metric('Latest close')).toHaveTextContent('110.26');
      expect(requests).toBe(1);
      expect(cache.getQueryData(pricesKey('A'))).toEqual(history);
    });
  });

  test('does not let a statistics failure hide healthy pinned calculations or offer irrelevant retries', async () => {
    defaultResponses();
    server.use(http.get(base + '/prices/A/stats', () => HttpResponse.json({}, { status: 503 })));
    await withMatrix(async ({ pin }) => {
      await screen.findByRole('button', { name: 'Retry A statistics' });
      pin(Date.parse('2026-08-04'));

      expect(metric('Total return')).toHaveTextContent('+10.12%');
      expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('rowheader', { name: 'Resources' })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).not.toHaveTextContent('unavailable');

      pin(null);

      expect(screen.getByRole('button', { name: 'Retry A statistics' })).toBeVisible();
      expect(metric('Total return')).toHaveTextContent('Unavailable');
    });
  });

  test('labels different starts and missing closing dates without carrying prices forward', async () => {
    defaultResponses();
    server.use(
      http.get(base + '/prices/B', () => HttpResponse.json([{ date: '2026-08-04', price: 200 }])),
      http.get(base + '/prices/C', () => HttpResponse.json([{ date: '2026-08-03', price: 300 }])),
    );
    await withMatrix(
      async ({ pin }) => {
        await waitFor(() => expect(metric('Latest close', 2)).toHaveTextContent('300.00'));

        pin(Date.parse('2026-08-03'));

        expect(metric('Closing price', 1)).toHaveTextContent('No observation');
        expect(metric('Total return', 1)).toHaveTextContent('Unavailable');
        expect(screen.getByText('B: No observations in this period.')).toBeVisible();

        pin(Date.parse('2026-08-04'));

        expect(metric('Closing price', 2)).toHaveTextContent('No observation');
        expect(metric('Total return', 2)).toHaveTextContent('0.00%');
        expect(metric('Closing price', 1)).toHaveTextContent('200.00');
        expect(screen.getByText('B: Aug 4, 2026 · 1 observation')).toBeVisible();
        expect(
          screen.getByText('C: Aug 3 – Aug 4, 2026 · 1 observation · Last recorded Aug 3, 2026'),
        ).toBeVisible();
      },
      ['A', 'B', 'C'],
    );
  });

  test('shows identical period metadata once for multiple tickers', async () => {
    defaultResponses();
    await withMatrix(
      async ({ pin }) => {
        await waitFor(() => expect(metric('Latest close', 2)).toHaveTextContent('110.26'));

        pin(Date.parse('2026-08-04'));

        expect(screen.getAllByText('Aug 3 – Aug 4, 2026 · 2 observations')).toHaveLength(1);
        expect(metric('Closing price', 2)).toHaveTextContent('110.26');
      },
      ['A', 'B', 'C'],
    );
  });
});
