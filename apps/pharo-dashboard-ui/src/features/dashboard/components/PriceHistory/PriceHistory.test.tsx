import { QueryClientProvider, useQueries } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { createApiClient } from '../../../../api/client';
import type { ApiClient } from '../../../../api/types';
import { pricesQueryOptions } from '../../../../api/prices';
import { createAppQueryClient } from '../../../../app/queryClient';
import { server } from '../../../../test/mocks/server';
import { PriceHistory } from './PriceHistory';

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

function Harness(props: { readonly client: ApiClient; readonly tickers: readonly string[] }) {
  const queries = useQueries({
    queries: props.tickers.map((ticker) => pricesQueryOptions(props.client, ticker)),
  });
  const resources = props.tickers.flatMap((ticker, index) => {
    const query = queries[index];
    return query ? [{ ticker, query }] : [];
  });
  return <PriceHistory resources={resources} />;
}

async function withHistory(
  tickers: readonly string[],
  run: (owner: {
    cache: QueryClient;
    view: RenderResult;
    show: (selected: readonly string[]) => void;
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
      <Harness client={client} tickers={tickers} />
    </QueryClientProvider>,
  );
  const failures: unknown[] = [];
  try {
    await run({
      cache,
      view,
      show: (selected) =>
        view.rerender(
          <QueryClientProvider client={cache}>
            <Harness client={client} tickers={selected} />
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

function definition(region: HTMLElement, label: string) {
  const term = within(region).getByText(label, { exact: true });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement) || value.tagName !== 'DD')
    throw new Error('Expected an associated definition value.');
  return value;
}

describe('PriceHistory', () => {
  test('derives count, UTC range and exact latest close from actual prices and renders the public chart', async () => {
    let requests = 0;
    server.use(
      http.get(base + '/prices/A', () => {
        requests += 1;
        return HttpResponse.json([
          { date: '2024-02-29', price: 11.125 },
          { date: '2024-03-10', price: 20.123456789 },
        ]);
      }),
    );
    await withHistory(['A'], async ({ view }) => {
      const region = screen.getByRole('region', { name: 'A prices' });
      await within(region).findByText('20.123456789', { exact: true });
      expect(definition(region, 'Observations')).toHaveTextContent(/^2$/);
      expect(definition(region, 'First date (UTC)')).toHaveTextContent(/^2024-02-29$/);
      expect(definition(region, 'Latest date (UTC)')).toHaveTextContent(/^2024-03-10$/);
      expect(definition(region, 'Latest close')).toHaveTextContent(/^20.123456789$/);
      expect(within(region).getByText('2024-02-29')).toHaveAttribute('datetime', '2024-02-29');
      measure(view);
      const chart = screen.getByRole('img', { name: 'Historical closing prices' });
      expect(chart).toHaveAttribute('height', '320');
      // Axis text owns a full-value SVG title; assert the actual text element.
      expect(within(chart).getByText('Price', { exact: true, selector: 'text' })).toBeVisible();
      expect(
        within(chart).getByText('Date (UTC)', { exact: true, selector: 'text' }),
      ).toBeVisible();
      await userEvent.click(
        screen.getByRole('button', { name: 'Show data table for Historical closing prices' }),
      );
      const table = screen.getByRole('table', { name: 'Data for Historical closing prices' });
      expect(within(table).getAllByRole('rowheader')).toHaveLength(2);
      expect(within(table).getByRole('cell', { name: '20.123456789' })).toBeVisible();
      expect(requests).toBe(1);
    });
  });

  test('does not mount an imitation empty chart while all histories are pending', async () => {
    const started = deferred();
    const release = deferred();
    const done = deferred();
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
        expect(screen.getByRole('progressbar', { name: 'Loading A prices' })).toBeVisible();
        expect(screen.getByText('Loading selected price histories…')).toBeVisible();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByText('Latest close', { exact: true })).not.toBeInTheDocument();
        expect(LocalResizeObserver.active.size).toBe(0);
        release.resolve();
        await screen.findByText('No recorded prices are available for A.');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByText('First date (UTC)', { exact: true })).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });

  test('shows loaded-empty and no-selection states without fabricated dates or prices', async () => {
    server.use(http.get(base + '/prices/A', () => HttpResponse.json([])));
    await withHistory(['A'], async ({ show }) => {
      await screen.findByText('No recorded prices are available for A.');
      expect(screen.queryByText('Latest close', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      show([]);
      expect(
        screen.getByText('Select an instrument to view its historical closing prices.'),
      ).toBeVisible();
      expect(screen.queryByRole('region', { name: 'A prices' })).not.toBeInTheDocument();
    });
  });

  test('keeps pending identities and the mounted chart stable as histories arrive and selection changes', async () => {
    const started = deferred();
    const release = deferred();
    const done = deferred();
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
    await withHistory(['A', 'B'], async ({ view, show }) => {
      try {
        await started.promise;
        await screen.findByText('1 of 2 selected histories available.');
        measure(view);
        const chart = screen.getByRole('img', { name: 'Historical closing prices' });
        const legend = screen.getByRole('list', { name: 'Legend for Historical closing prices' });
        expect(within(legend).getByText('A', { exact: true })).toBeVisible();
        expect(within(legend).getByText('B', { exact: true })).toBeVisible();
        const beforePath = chart.querySelector('[data-series-id="B"] path');
        if (!beforePath) throw new Error('The available B series has no public SVG path.');
        const appearance = beforePath.getAttribute('class');
        expect(chart.querySelectorAll('[data-series-id="A"] circle')).toHaveLength(0);
        expect(screen.getByRole('region', { name: 'A prices' })).toHaveTextContent(
          'Loading prices…',
        );
        release.resolve();
        await screen.findByText('2 of 2 selected histories available.');
        expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
        expect(chart.querySelector('[data-series-id="B"] path')).toHaveAttribute(
          'class',
          appearance,
        );
        show(['B']);
        await screen.findByText('1 of 1 selected histories available.');
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

  test('retains a successful sibling and retries only the failed selected price resource', async () => {
    const requests = { A: 0, B: 0 };
    server.use(
      http.get(base + '/prices/A', () => {
        requests.A += 1;
        return requests.A === 1
          ? HttpResponse.json({ raw: 'RAW_PRICE_FAILURE_MARKER' }, { status: 404 })
          : HttpResponse.json([{ date: '2024-03-10', price: 11 }]);
      }),
      http.get(base + '/prices/B', () => {
        requests.B += 1;
        return HttpResponse.json([{ date: '2024-03-10', price: 22 }]);
      }),
    );
    await withHistory(['A', 'B'], async ({ view }) => {
      await screen.findByRole('button', { name: 'Retry A prices' });
      await screen.findByText('1 of 2 selected histories available.');
      const a = screen.getByRole('region', { name: 'A prices' });
      const b = screen.getByRole('region', { name: 'B prices' });
      expect(within(a).getByRole('alert')).toHaveTextContent('Instrument not found.');
      expect(screen.queryByText(/RAW_PRICE_FAILURE_MARKER/)).not.toBeInTheDocument();
      expect(definition(b, 'Latest close')).toHaveTextContent(/^22$/);
      expect(within(a).queryByText('Latest close', { exact: true })).not.toBeInTheDocument();
      measure(view);
      const chart = screen.getByRole('img', { name: 'Historical closing prices' });
      expect(chart.querySelectorAll('[data-series-id="A"] circle')).toHaveLength(0);
      await userEvent.click(within(a).getByRole('button', { name: 'Retry A prices' }));
      await screen.findByText('2 of 2 selected histories available.');
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(definition(a, 'Latest close')).toHaveTextContent(/^11$/);
      expect(definition(b, 'Latest close')).toHaveTextContent(/^22$/);
      expect(requests).toEqual({ A: 2, B: 1 });
    });
  });

  test('keeps cached same-ticker prices and chart inspection through a failed refetch', async () => {
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
      const region = screen.getByRole('region', { name: 'A prices' });
      await within(region).findByText('22', { exact: true });
      measure(view);
      const chart = screen.getByRole('img', { name: 'Historical closing prices' });
      const inspector = screen.getByRole('slider', { name: 'Inspect Historical closing prices' });
      // jsdom does not implement native range-key behavior; browser tests cover End.
      fireEvent.change(inspector, { target: { value: '1' } });
      expect(inspector).toHaveValue('1');
      await act(async () => {
        await cache.refetchQueries({ type: 'active' });
      });
      await within(region).findByRole('alert');
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(inspector).toHaveValue('1');
      expect(definition(region, 'Latest close')).toHaveTextContent(/^22$/);
      expect(screen.queryByText(/REFETCH_PRIVATE_BODY/)).not.toBeInTheDocument();
      await userEvent.click(within(region).getByRole('button', { name: 'Retry A prices' }));
      await waitFor(() => expect(within(region).queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
      expect(requests).toBe(3);
    });
  });

  test('all-failed history is truthful without chart, raw error bodies or invented summaries', async () => {
    server.use(
      http.get(base + '/prices/A', () =>
        HttpResponse.json({ leaked: 'OWNED_RAW_ERROR' }, { status: 404 }),
      ),
    );
    await withHistory(['A'], async () => {
      await screen.findByRole('button', { name: 'Retry A prices' });
      expect(screen.getByText('No selected price history is currently available.')).toBeVisible();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByText('Observations', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText(/OWNED_RAW_ERROR/)).not.toBeInTheDocument();
    });
  });

  test('late removed A data never appears under B or remounts its current chart', async () => {
    const started = deferred();
    const release = deferred();
    const done = deferred();
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
        const b = screen.getByRole('region', { name: 'B prices' });
        await within(b).findByText('222', { exact: true });
        measure(view);
        const chart = screen.getByRole('img', { name: 'Historical closing prices' });
        release.resolve();
        await done.promise;
        await waitFor(() => expect(definition(b, 'Latest close')).toHaveTextContent(/^222$/));
        expect(screen.queryByRole('region', { name: 'A prices' })).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Historical closing prices' })).toBe(chart);
        expect(chart.querySelector('[data-series-id="A"]')).not.toBeInTheDocument();
        expect(within(b).queryByText('111', { exact: true })).not.toBeInTheDocument();
      } finally {
        release.resolve();
        await done.promise;
      }
    });
  });
});
