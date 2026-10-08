import { QueryClientProvider, useQueries } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { createApiClient } from '../../../../api/client';
import type { ApiClient } from '../../../../api/types';
import { pricesKey, pricesQueryOptions } from '../../../../api/prices';
import { createAppQueryClient } from '../../../../app/queryClient';
import { server } from '../../../../test/mocks/server';
import { PriceHistory } from './PriceHistory';
import type { ChartMode } from '../../../../app/types';

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

// jsdom has no layout. This owned witness only supplies a content-box measurement;
// the real public chart renders its geometry, and actual browser tests prove sizing.
class LocalResizeObserver implements ResizeObserver {
  static readonly active = new Set<LocalResizeObserver>();
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    LocalResizeObserver.active.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    LocalResizeObserver.active.delete(this);
  }
  deliver(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, 672, 320),
          borderBoxSize: [{ inlineSize: 672, blockSize: 320 }],
          contentBoxSize: [{ inlineSize: 672, blockSize: 320 }],
          devicePixelContentBoxSize: [{ inlineSize: 672, blockSize: 320 }],
        },
      ],
      this,
    );
  }
}

interface HarnessProps {
  readonly client: ApiClient;
  readonly tickers: readonly string[];
  readonly mode: ChartMode;
}

function Harness(props: HarnessProps) {
  const queries = useQueries({
    queries: props.tickers.map((ticker) => pricesQueryOptions(props.client, ticker)),
  });
  const resources = props.tickers.flatMap((ticker, index) => {
    const query = queries[index];
    return query ? [{ ticker, query }] : [];
  });
  return <PriceHistory resources={resources} mode={props.mode} />;
}

async function withHistory(
  tickers: readonly string[],
  run: (owner: {
    cache: QueryClient;
    view: RenderResult;
    show: (selected: readonly string[], mode?: ChartMode) => void;
  }) => Promise<void>,
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: LocalResizeObserver,
  });
  const cache = createAppQueryClient();
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retryDelay: 0 } });
  const client = createApiClient({ baseURL: base });
  const view = render(
    <QueryClientProvider client={cache}>
      <Harness client={client} tickers={tickers} mode="price" />
    </QueryClientProvider>,
  );
  const failures: unknown[] = [];
  try {
    await run({
      cache,
      view,
      show: (selected, mode = 'price') =>
        view.rerender(
          <QueryClientProvider client={cache}>
            <Harness client={client} tickers={selected} mode={mode} />
          </QueryClientProvider>,
        ),
    });
  } catch (error) {
    failures.push(error);
  }
  for (const release of [
    () => view.unmount(),
    () => cache.cancelQueries(),
    () => cache.clear(),
    () => {
      if (LocalResizeObserver.active.size !== 0)
        throw new Error('Chart measurement owner was not retired.');
    },
    () => {
      if (previous) Object.defineProperty(globalThis, 'ResizeObserver', previous);
      else if (!Reflect.deleteProperty(globalThis, 'ResizeObserver'))
        throw new Error('Owned ResizeObserver could not be restored.');
    },
  ]) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Price history test and cleanup failed.');
}

function measure(view: RenderResult) {
  const targets = [...LocalResizeObserver.active].flatMap((observer) =>
    [...observer.targets]
      .filter((target) => view.container.contains(target))
      .map((target) => ({ observer, target })),
  );
  if (targets.length !== 1) throw new Error('Expected one actual chart measurement owner.');
  act(() => {
    for (const { observer, target } of targets) observer.deliver(target);
  });
}

async function settled(
  cache: QueryClient,
  ticker: string,
  status: 'success' | 'error' = 'success',
) {
  await waitFor(() => expect(cache.getQueryState(pricesKey(ticker))?.status).toBe(status));
}

async function chartReady(view: RenderResult) {
  await waitFor(() =>
    expect(
      [...LocalResizeObserver.active].some((observer) =>
        [...observer.targets].some((target) => view.container.contains(target)),
      ),
    ).toBe(true),
  );
  measure(view);
  return screen.getByRole('img', { name: 'Historical closing prices' });
}

describe('PriceHistory', () => {
  test('keeps genuinely small percentage-axis ticks distinct without rounding the plot', async () => {
    server.use(
      http.get(base + '/prices/A', () =>
        HttpResponse.json([
          { date: '2024-03-10', price: 100 },
          { date: '2024-03-11', price: 100.001 },
        ]),
      ),
    );
    await withHistory(['A'], async ({ view, show }) => {
      await chartReady(view);
      show(['A'], 'performance');
      const chart = screen.getByRole('img', { name: 'Rebased price change' });
      const labels = [...chart.querySelectorAll('[aria-label="Value axis"] title')].map(
        (title) => title.textContent,
      );
      expect(labels.length).toBeGreaterThan(1);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels).not.toContain('0.00%');
    });
  });

  test('switches presentation without remounting inspection, refetching or mutating raw data', async () => {
    const raw = [
      { date: '2024-03-10', price: 100 },
      { date: '2024-03-11', price: 110 },
      { date: '2024-03-12', price: 99 },
    ];
    let requests = 0;
    server.use(
      http.get(base + '/prices/A', () => {
        requests += 1;
        return HttpResponse.json(raw);
      }),
    );
    await withHistory(['A'], async ({ view, show, cache }) => {
      const chart = await chartReady(view);
      const inspector = screen.getByRole('slider', { name: 'Inspect Historical closing prices' });
      fireEvent.change(inspector, { target: { value: '1' } });
      show(['A'], 'performance');
      expect(screen.getByRole('img', { name: 'Rebased price change' })).toBe(chart);
      expect(screen.getByRole('slider', { name: 'Inspect Rebased price change' })).toBe(inspector);
      expect(inspector).toHaveValue('1');
      expect(
        within(screen.getByRole('region', { name: 'Details for Rebased price change' })).getByText(
          '+10.00%',
          { exact: true },
        ),
      ).toBeVisible();
      expect(chart.querySelector('[data-chart-baseline="0"]')).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Show data table for Rebased price change' }),
      );
      expect(
        within(screen.getByRole('table', { name: 'Data for Rebased price change' }))
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ).toEqual(['0.00%', '+10.00%', '-1.00%']);
      show(['A'], 'price');
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(inspector).toHaveValue('1');
      expect(chart.querySelector('[data-chart-baseline]')).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('table', { name: 'Data for Historical closing prices' }))
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ).toEqual(['100.00', '110.00', '99.00']);
      expect(cache.getQueryData(pricesKey('A'))).toEqual(raw);
      expect(requests).toBe(1);
    });
  });

  test('describes differing actual windows and bases without relative-date alignment', async () => {
    server.use(
      http.get(base + '/prices/A', () =>
        HttpResponse.json([
          { date: '2024-03-10', price: 100 },
          { date: '2024-03-12', price: 110 },
        ]),
      ),
      http.get(base + '/prices/B', () => HttpResponse.json([{ date: '2024-03-11', price: 30 }])),
    );
    await withHistory(['A', 'B'], async ({ show, cache }) => {
      await settled(cache, 'A');
      await settled(cache, 'B');
      show(['A', 'B'], 'performance');
      const windows = within(screen.getByRole('list', { name: 'Recorded windows by instrument' }));
      expect(
        windows.getByText(
          /A: Mar 10 – Mar 12, 2024 \(UTC\), 2 observations\. Base: Mar 10, 2024\./,
        ),
      ).toBeVisible();
      expect(
        windows.getByText(/B: Mar 11, 2024 \(UTC\), 1 observation\. Base: Mar 11, 2024\./),
      ).toBeVisible();
    });
  });

  test('renders human UTC detail and a complete table while preserving exact cached prices', async () => {
    const raw = [
      { date: '2024-02-29', price: 11.125 },
      { date: '2024-03-10', price: 20.123456789 },
    ];
    let requests = 0;
    server.use(
      http.get(base + '/prices/A', () => {
        requests += 1;
        return HttpResponse.json(raw);
      }),
    );
    await withHistory(['A'], async ({ view, cache }) => {
      const chart = await chartReady(view);
      expect(chart).toHaveAttribute('height', '320');
      expect(within(chart).getByText('Price', { exact: true, selector: 'text' })).toBeVisible();
      expect(
        within(chart).getByText('Date (UTC)', { exact: true, selector: 'text' }),
      ).toBeVisible();
      const details = screen.getByRole('region', { name: 'Details for Historical closing prices' });
      expect(within(details).getByText('Sun, Mar 10, 2024', { exact: true })).toBeVisible();
      expect(within(details).getByText('20.12', { exact: true })).toBeVisible();
      expect(
        screen.getByRole('slider', { name: 'Inspect Historical closing prices' }),
      ).toHaveAttribute('aria-valuetext', expect.stringContaining('Sunday, March 10, 2024'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Show data table for Historical closing prices' }),
      );
      const table = screen.getByRole('table', { name: 'Data for Historical closing prices' });
      expect(within(table).getAllByRole('rowheader')).toHaveLength(2);
      expect(
        within(table).getByRole('rowheader', { name: 'Thursday, February 29, 2024' }),
      ).toHaveTextContent('Feb 29, 2024');
      expect(within(table).getByText('Feb 29, 2024', { exact: true })).toHaveAttribute(
        'datetime',
        '2024-02-29T00:00:00.000Z',
      );
      expect(within(table).getByRole('cell', { name: '20.12' })).toBeVisible();
      expect(cache.getQueryData(pricesKey('A'))).toEqual(raw);
      // Shared range/count belongs to the toolbar; this owner retains actual detail.
      expect(
        screen.queryByText('Feb 29 – Mar 10, 2024 (UTC)', { exact: true }),
      ).not.toBeInTheDocument();
      expect(requests).toBe(1);
    });
  });

  test('reserves pending plot space without an imitation empty chart', async () => {
    const started = deferred(),
      release = deferred(),
      done = deferred();
    server.use(
      http.get(base + '/prices/A', async () => {
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json([]);
        } finally {
          done.resolve();
        }
      }),
    );
    await withHistory(['A'], async () => {
      try {
        await started.promise;
        expect(screen.getByText('Loading selected price histories…')).toBeVisible();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(LocalResizeObserver.active.size).toBe(0);
        release.resolve();
        await screen.findByText('No selected price history is currently available.');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('shows loaded-empty and no-selection states without fabricated dates or prices', async () => {
    server.use(http.get(base + '/prices/A', () => HttpResponse.json([])));
    await withHistory(['A'], async ({ show }) => {
      await screen.findByText('No selected price history is currently available.');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      show([]);
      expect(
        screen.getByText('Select an instrument to view its historical closing prices.'),
      ).toBeVisible();
    });
  });

  test('keeps selected identities and the mounted chart stable as histories arrive', async () => {
    const started = deferred(),
      release = deferred(),
      done = deferred();
    const requests: string[] = [];
    server.use(
      http.get(base + '/prices/A', async () => {
        requests.push('A');
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json([{ date: '2024-03-10', price: 11 }]);
        } finally {
          done.resolve();
        }
      }),
      http.get(base + '/prices/B', () => {
        requests.push('B');
        return HttpResponse.json([{ date: '2024-03-10', price: 22 }]);
      }),
    );
    await withHistory(['A', 'B'], async ({ view, show, cache }) => {
      try {
        await started.promise;
        const chart = await chartReady(view);
        const legend = screen.getByRole('list', { name: 'Legend for Historical closing prices' });
        expect(within(legend).getByText('A', { exact: true })).toBeVisible();
        expect(within(legend).getByText('B', { exact: true })).toBeVisible();
        const path = chart.querySelector('[data-series-id="B"] path');
        if (!path) throw new Error('Available B has no SVG path.');
        const appearance = path.getAttribute('class');
        expect(chart.querySelectorAll('[data-series-id="A"] circle')).toHaveLength(0);
        expect(cache.getQueryState(pricesKey('A'))?.status).toBe('pending');
        release.resolve();
        await settled(cache, 'A');
        await waitFor(() =>
          expect(chart.querySelector('[data-series-id="A"] circle')).toBeInTheDocument(),
        );
        expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
        show(['B']);
        expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
        expect(chart.querySelector('[data-series-id="B"] path')).toHaveAttribute(
          'class',
          appearance,
        );
        expect(LocalResizeObserver.active.size).toBe(1);
        expect(requests).toEqual(['A', 'B']);
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('retains a successful plotted sibling when one selected history fails and recovers', async () => {
    const requests = { A: 0, B: 0 };
    let recovered = false;
    server.use(
      http.get(base + '/prices/A', () => {
        requests.A += 1;
        return recovered
          ? HttpResponse.json([{ date: '2024-03-10', price: 11 }])
          : HttpResponse.json({ raw: 'RAW_PRICE_FAILURE_MARKER' }, { status: 503 });
      }),
      http.get(base + '/prices/B', () => {
        requests.B += 1;
        return HttpResponse.json([{ date: '2024-03-10', price: 22 }]);
      }),
    );
    await withHistory(['A', 'B'], async ({ view, cache }) => {
      await settled(cache, 'A', 'error');
      const chart = await chartReady(view);
      expect(screen.queryByText(/RAW_PRICE_FAILURE_MARKER/)).not.toBeInTheDocument();
      expect(chart.querySelectorAll('[data-series-id="A"] circle')).toHaveLength(0);
      expect(chart.querySelector('[data-series-id="B"] circle')).toBeInTheDocument();
      recovered = true;
      // The matrix owns the Retry button; verify this pure chart keeps its owner through Query updates.
      await act(async () => cache.refetchQueries({ queryKey: pricesKey('A'), exact: true }));
      await waitFor(() =>
        expect(chart.querySelector('[data-series-id="A"] circle')).toBeInTheDocument(),
      );
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(requests).toEqual({ A: 4, B: 1 });
    });
  });

  test('keeps cached prices and explicit inspection through a failed refetch', async () => {
    let requests = 0;
    server.use(
      http.get(base + '/prices/A', () => {
        requests += 1;
        return requests === 2
          ? HttpResponse.json({ raw: 'REFETCH_PRIVATE_BODY' }, { status: 404 })
          : HttpResponse.json([
              { date: '2024-03-10', price: 11 },
              { date: '2024-03-11', price: 22 },
            ]);
      }),
    );
    await withHistory(['A'], async ({ cache, view }) => {
      const chart = await chartReady(view);
      const inspector = screen.getByRole('slider', { name: 'Inspect Historical closing prices' });
      fireEvent.change(inspector, { target: { value: '0' } });
      await act(async () => cache.refetchQueries({ type: 'active' }));
      await settled(cache, 'A', 'error');
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(inspector).toHaveValue('0');
      expect(
        within(
          screen.getByRole('region', { name: 'Details for Historical closing prices' }),
        ).getByText('11.00', { exact: true }),
      ).toBeVisible();
      expect(screen.queryByText(/REFETCH_PRIVATE_BODY/)).not.toBeInTheDocument();
      expect(cache.getQueryData(pricesKey('A'))).toEqual([
        { date: '2024-03-10', price: 11 },
        { date: '2024-03-11', price: 22 },
      ]);
      await act(async () => cache.refetchQueries({ type: 'active' }));
      await settled(cache, 'A');
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(requests).toBe(3);
    });
  });

  test('all-failed history stays truthful without chart, raw errors or invented values', async () => {
    server.use(
      http.get(base + '/prices/A', () =>
        HttpResponse.json({ leaked: 'OWNED_RAW_ERROR' }, { status: 404 }),
      ),
    );
    await withHistory(['A'], async () => {
      await screen.findByText('No selected price history is currently available.');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/OWNED_RAW_ERROR/)).not.toBeInTheDocument();
    });
  });

  test('names an unavailable rebasing result while preserving the valid raw history', async () => {
    const raw = [
      { date: '2024-03-10', price: 1e-308 },
      { date: '2024-03-11', price: 1e308 },
    ];
    server.use(http.get(base + '/prices/A', () => HttpResponse.json(raw)));
    await withHistory(['A'], async ({ show, cache }) => {
      await settled(cache, 'A');
      show(['A'], 'performance');
      expect(
        await screen.findByText(
          'Rebased price change is unavailable for A. Raw prices remain available in Price view.',
        ),
      ).toBeVisible();
      expect(cache.getQueryData(pricesKey('A'))).toEqual(raw);
      show(['A'], 'price');
      expect(screen.queryByText(/Rebased price change is unavailable/)).not.toBeInTheDocument();
    });
  });

  test('late removed A data never appears under B or remounts its chart', async () => {
    const started = deferred(),
      release = deferred(),
      done = deferred();
    server.use(
      http.get(base + '/prices/A', async () => {
        started.resolve();
        try {
          await release.promise;
          return HttpResponse.json([{ date: '2024-03-10', price: 111 }]);
        } finally {
          done.resolve();
        }
      }),
      http.get(base + '/prices/B', () => HttpResponse.json([{ date: '2024-03-10', price: 222 }])),
    );
    await withHistory(['A'], async ({ view, show }) => {
      try {
        await started.promise;
        show(['B']);
        const chart = await chartReady(view);
        release.resolve();
        await done.promise;
        expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
        expect(chart.querySelector('[data-series-id="A"]')).not.toBeInTheDocument();
        const details = within(
          screen.getByRole('region', { name: 'Details for Historical closing prices' }),
        );
        expect(details.getByText('222.00', { exact: true })).toBeVisible();
        expect(details.queryByText('111.00', { exact: true })).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });
});
