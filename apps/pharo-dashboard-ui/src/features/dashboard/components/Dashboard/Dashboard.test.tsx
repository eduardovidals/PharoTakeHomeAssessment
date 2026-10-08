import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { renderApp } from '../../../../test/renderApp';
import type { AppTest } from '../../../../test/renderApp';
import { server } from '../../../../test/mocks/server';

// This local witness lets the real chart own its observer in jsdom. It provides
// no measured geometry; compiled browser tests establish rendering and dimensions.
const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});
afterAll(() => {
  if (resizeObserverDescriptor) {
    Object.defineProperty(globalThis, 'ResizeObserver', resizeObserverDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  }
});

const available = ['AAA', 'BBB', 'CCC', 'DDD'];
const series = [
  { date: '2024-03-10', price: 100 },
  { date: '2024-03-11', price: 123.45 },
];
const stats = {
  totalReturnPercent: 23.45,
  dailyVolatilityPercent: null,
  maxDrawdownPercent: 0,
};

function installMarketHandlers() {
  const requests = new Map<string, number>();
  function record(resource: string) {
    requests.set(resource, (requests.get(resource) ?? 0) + 1);
  }
  server.use(
    http.get('*/api/instruments', () => {
      record('instruments');
      return HttpResponse.json(available);
    }),
    http.get('*/api/prices/:ticker/stats', ({ params }) => {
      record(`${String(params.ticker)} statistics`);
      return typeof params.ticker === 'string' && available.includes(params.ticker)
        ? HttpResponse.json(stats)
        : HttpResponse.json({ detail: '/private/source/market.csv' }, { status: 404 });
    }),
    http.get('*/api/prices/:ticker', ({ params }) => {
      record(`${String(params.ticker)} prices`);
      return typeof params.ticker === 'string' && available.includes(params.ticker)
        ? HttpResponse.json(series)
        : HttpResponse.json({ detail: '/private/source/market.csv' }, { status: 404 });
    }),
  );
  return requests;
}

function createGate() {
  let open: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    promise,
    release() {
      if (!open) throw new Error('The owned response gate was not initialized');
      open();
    },
  };
}

async function openChoices(app: AppTest, user: ReturnType<typeof userEvent.setup>) {
  const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
  await user.click(input);
  if (!within(document.body).queryByRole('listbox')) await user.keyboard('{ArrowDown}');
  return within(await within(document.body).findByRole('listbox'));
}

async function chooseInstrument(
  app: AppTest,
  user: ReturnType<typeof userEvent.setup>,
  ticker: string,
) {
  const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
  await openChoices(app, user);
  await user.clear(input);
  await user.type(input, ticker);
  await user.click(await within(document.body).findByRole('option', { name: ticker }));
  await waitFor(() =>
    expect(new URLSearchParams(app.history.location.search).get('tickers')?.split(',')).toContain(
      ticker,
    ),
  );
  await user.keyboard('{Escape}');
}

async function clearSelection(app: AppTest, user: ReturnType<typeof userEvent.setup>) {
  await user.click(app.view.getByRole('button', { name: 'Clear selection' }));
  await waitFor(() => expect(app.history.location.search).toBe(''));
  await waitFor(() =>
    expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveFocus(),
  );
  await user.keyboard('{Escape}');
}

async function expectLimit(app: AppTest, user: ReturnType<typeof userEvent.setup>) {
  const choices = await openChoices(app, user);
  expect(await choices.findByRole('option', { name: 'DDD' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await user.keyboard('{Escape}');
  expect(app.view.getByText(/Up to 3 instruments\. Remove one to add another\./)).toBeVisible();
}

describe('Dashboard URL selection and independently owned resources', () => {
  test('uses URL mode for the control and preserves fetched resources through explicit view changes', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,BBB'] });
    await within(app.view.getByRole('region', { name: 'BBB statistics' })).findByText('+23.45%', {
      exact: true,
    });
    expect(app.view.getByRole('radio', { name: 'Performance' })).toBeChecked();
    const loaded = [...requests];
    await user.click(app.view.getByRole('radio', { name: 'Price' }));
    await waitFor(() =>
      expect(new URLSearchParams(app.history.location.search).get('view')).toBe('price'),
    );
    expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked();
    await user.click(app.view.getByRole('radio', { name: 'Performance' }));
    await waitFor(() =>
      expect(new URLSearchParams(app.history.location.search).get('view')).toBe('performance'),
    );
    await act(async () => app.history.back());
    await waitFor(() => expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked());
    expect([...requests]).toEqual(loaded);
    await clearSelection(app, user);
    await waitFor(() => expect(app.history.location.search).toBe(''));
    expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked();
  });

  test('handles a rejected view change safely and lets the next choice recover', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,BBB'] });
    const navigate = vi
      .spyOn(app.router, 'navigate')
      .mockRejectedValueOnce(new Error('PRIVATE_ROUTING_DETAIL'));
    try {
      await user.click(app.view.getByRole('radio', { name: 'Price' }));
      expect(
        await app.view.findByText('The chart view could not be updated. Please try again.'),
      ).toBeVisible();
      expect(app.view.queryByText(/PRIVATE_ROUTING_DETAIL/)).not.toBeInTheDocument();
      expect(app.view.getByRole('radio', { name: 'Performance' })).toBeChecked();
      await user.click(app.view.getByRole('radio', { name: 'Price' }));
      await waitFor(() => expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked());
      expect(
        app.view.queryByText('The chart view could not be updated. Please try again.'),
      ).not.toBeInTheDocument();
    } finally {
      navigate.mockRestore();
    }
  });

  // This real Router/Query journey exercises many native popup and history transitions.
  // Its focused run passes quickly; allow contention from the full concurrent app suite.
  test('selects, removes, clears and follows real history while reusing fetched resources', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    expect(
      await app.view.findByText('Select an instrument to view its prices and statistics.'),
    ).toBeVisible();
    const choices = await openChoices(app, user);
    expect(await choices.findAllByRole('option')).toHaveLength(4);
    await user.keyboard('{Escape}');
    expect(requests.size).toBe(1);

    await chooseInstrument(app, user, 'AAA');
    expect(await app.view.findByRole('article', { name: 'AAA market data' })).toBeVisible();
    const firstPrices = within(app.view.getByRole('region', { name: 'AAA prices' }));
    expect(await firstPrices.findByText('123.45', { exact: true })).toBeVisible();
    expect(firstPrices.getByText('2', { exact: true })).toBeVisible();
    expect(firstPrices.getByText('Mar 11, 2024', { exact: true })).toHaveAttribute(
      'datetime',
      '2024-03-11',
    );
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA');

    // Final-tag removal returns focus to the input; adding again uses cached data.
    const firstStats = within(app.view.getByRole('region', { name: 'AAA statistics' }));
    expect(await firstStats.findByText('+23.45%', { exact: true })).toBeVisible();
    await user.click(app.view.getByRole('button', { name: 'Remove AAA' }));
    await waitFor(() => expect(app.view.queryByRole('article')).not.toBeInTheDocument());
    expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await chooseInstrument(app, user, 'AAA');
    expect(await app.view.findByRole('article', { name: 'AAA market data' })).toBeVisible();
    await chooseInstrument(app, user, 'BBB');
    expect(await app.view.findByRole('article', { name: 'BBB market data' })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB');
    await user.click(app.view.getByRole('button', { name: 'Remove AAA' }));
    await waitFor(() => {
      expect(app.view.queryByRole('article', { name: 'AAA market data' })).not.toBeInTheDocument();
    });
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('BBB');

    await act(async () => app.history.back());
    expect(await app.view.findByRole('article', { name: 'AAA market data' })).toBeVisible();
    expect(
      within(app.view.getByRole('region', { name: 'AAA prices' })).getByText('123.45', {
        exact: true,
      }),
    ).toBeVisible();
    await act(async () => app.history.forward());
    await waitFor(() => {
      expect(app.view.queryByRole('article', { name: 'AAA market data' })).not.toBeInTheDocument();
    });
    await clearSelection(app, user);
    expect(
      await app.view.findByText('Select an instrument to view its prices and statistics.'),
    ).toBeVisible();
    expect(app.history.location.search).toBe('');
    await act(async () => app.history.back());
    expect(await app.view.findByRole('article', { name: 'BBB market data' })).toBeVisible();
    expect(requests.get('AAA prices')).toBe(1);
    expect(requests.get('AAA statistics')).toBe(1);
    expect(requests.get('BBB prices')).toBe(1);
    expect(requests.get('BBB statistics')).toBe(1);
    await app.dispose();
  }, 10000);

  test('explains an over-limit direct link and a fourth UI attempt without replacing selections', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=aaa,AAA,BBB,CCC,DDD'] });
    expect(
      await app.view.findByText('Only the first three instruments in this link are selected.'),
    ).toBeVisible();
    expect(
      app.view.getAllByRole('article').map((element) => element.getAttribute('aria-label')),
    ).toEqual(['AAA market data', 'BBB market data', 'CCC market data']);
    await expectLimit(app, user);
    expect(app.view.getAllByRole('article')).toHaveLength(3);
    expect(requests.has('DDD prices')).toBe(false);
    expect(requests.has('DDD statistics')).toBe(false);
    expect(app.history.location.search).toBe('?tickers=aaa,AAA,BBB,CCC,DDD');
    await user.click(app.view.getByRole('button', { name: 'Remove BBB' }));
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,CCC');
    await waitFor(() => {
      expect(
        app.view.queryByText('Only the first three instruments in this link are selected.'),
      ).not.toBeInTheDocument();
    });
    await chooseInstrument(app, user, 'DDD');
    expect(await app.view.findByRole('article', { name: 'DDD market data' })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,CCC,DDD');
    await app.dispose();
  });

  test('keeps limit feedback accurate when Back and Forward change the URL selection', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({
      initialEntries: ['/?tickers=AAA,BBB', '/?tickers=AAA,BBB,CCC'],
    });
    const notice = /Up to 3 instruments\. Remove one to add another\./;
    await expectLimit(app, user);
    await act(async () => app.history.back());
    await waitFor(() => expect(app.view.getAllByRole('article')).toHaveLength(2));
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB');
    expect(app.view.queryByText(notice)).not.toBeInTheDocument();
    await act(async () => app.history.forward());
    await waitFor(() => expect(app.view.getAllByRole('article')).toHaveLength(3));
    expect(app.view.getByText(notice)).toBeVisible();
    await act(async () => app.history.back());
    await waitFor(() => expect(app.view.getAllByRole('article')).toHaveLength(2));
    await chooseInstrument(app, user, 'DDD');
    expect(await app.view.findByRole('article', { name: 'DDD market data' })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB,DDD');
    expect(app.view.getByText(notice)).toBeVisible();
    await app.dispose();
  });

  test('shows invalid direct-link feedback and recovers through an intentional selection', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA&tickers=BBB'] });
    expect(await app.view.findByText("The link's instrument selection is invalid.")).toBeVisible();
    expect(app.view.queryByRole('article')).not.toBeInTheDocument();
    await chooseInstrument(app, user, 'CCC');
    expect(await app.view.findByRole('article', { name: 'CCC market data' })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('CCC');
    expect(
      app.view.queryByText("The link's instrument selection is invalid."),
    ).not.toBeInTheDocument();
    await app.dispose();
  });

  test('starts all resources concurrently and settles each without hiding still-pending siblings', async () => {
    const instrumentGate = createGate();
    const priceGate = createGate();
    const statsGate = createGate();
    const started = new Set<string>();
    const handlers: Promise<Response>[] = [];
    function hold(name: string, gate: ReturnType<typeof createGate>, response: Response) {
      started.add(name);
      const pending = gate.promise.then(() => response);
      handlers.push(pending);
      return pending;
    }
    server.use(
      http.get('*/api/instruments', () =>
        hold('instruments', instrumentGate, HttpResponse.json(available)),
      ),
      http.get('*/api/prices/AAA', () => hold('prices', priceGate, HttpResponse.json(series))),
      http.get('*/api/prices/AAA/stats', () =>
        hold('statistics', statsGate, HttpResponse.json(stats)),
      ),
    );
    try {
      const app = await renderApp({ initialEntries: ['/?tickers=AAA'] });
      await waitFor(() =>
        expect(started).toEqual(new Set(['instruments', 'prices', 'statistics'])),
      );
      expect(app.view.getByText('Loading instruments…', { exact: true })).toBeVisible();
      expect(app.view.getByRole('progressbar', { name: 'Loading AAA prices' })).toBeVisible();
      expect(app.view.getByRole('progressbar', { name: 'Loading AAA statistics' })).toBeVisible();
      priceGate.release();
      expect(
        await within(app.view.getByRole('region', { name: 'AAA prices' })).findByText('123.45'),
      ).toBeVisible();
      expect(app.view.getByRole('progressbar', { name: 'Loading AAA statistics' })).toBeVisible();
      expect(app.view.getByText('Loading instruments…', { exact: true })).toBeVisible();
      statsGate.release();
      const statistics = within(app.view.getByRole('region', { name: 'AAA statistics' }));
      expect(await statistics.findByText('Not enough observations')).toBeVisible();
      expect(statistics.getByText('+23.45%', { exact: true })).toBeVisible();
      expect(statistics.getByText('0.00%', { exact: true })).toBeVisible();
      instrumentGate.release();
      expect(await app.view.findByRole('button', { name: 'Remove AAA' })).toBeVisible();
      await app.dispose();
    } finally {
      instrumentGate.release();
      priceGate.release();
      statsGate.release();
      await Promise.all(handlers);
    }
  });

  test('preserves successful sibling resources and retries only the chosen failure in the same app', async () => {
    const requests = installMarketHandlers();
    let statsAttempts = 0;
    let priceAttempts = 0;
    let recovered = false;
    server.use(
      http.get('*/api/prices/AAA/stats', () => {
        statsAttempts += 1;
        return recovered
          ? HttpResponse.json({
              totalReturnPercent: 6,
              dailyVolatilityPercent: 1.5,
              maxDrawdownPercent: 2,
            })
          : HttpResponse.json({ detail: 'private raw response' }, { status: 404 });
      }),
      http.get('*/api/prices/BBB', () => {
        priceAttempts += 1;
        return HttpResponse.json({ detail: 'another private raw response' }, { status: 404 });
      }),
    );
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,BBB'] });
    const aaaPrices = within(app.view.getByRole('region', { name: 'AAA prices' }));
    const aaaStats = within(app.view.getByRole('region', { name: 'AAA statistics' }));
    const bbbPrices = within(app.view.getByRole('region', { name: 'BBB prices' }));
    const bbbStats = within(app.view.getByRole('region', { name: 'BBB statistics' }));
    expect(await aaaPrices.findByText('123.45', { exact: true })).toBeVisible();
    expect(await aaaStats.findByRole('alert')).toHaveTextContent('Instrument not found.');
    expect(await bbbPrices.findByRole('alert')).toHaveTextContent('Instrument not found.');
    expect(await bbbStats.findByText('+23.45%', { exact: true })).toBeVisible();
    expect(app.view.getAllByText(/Results for (AAA|BBB) are incomplete/)).toHaveLength(2);
    expect(app.view.queryByText(/private raw response/)).not.toBeInTheDocument();

    recovered = true;
    await user.click(aaaStats.getByRole('button', { name: 'Retry AAA statistics' }));
    expect(await aaaStats.findByText('1.50%', { exact: true })).toBeVisible();
    expect(aaaStats.getByText('+6.00%', { exact: true })).toBeVisible();
    expect(aaaStats.getByText('2.00%', { exact: true })).toBeVisible();
    expect(aaaStats.queryByRole('alert')).not.toBeInTheDocument();
    expect(bbbPrices.getByRole('alert')).toHaveTextContent('Instrument not found.');
    expect(aaaPrices.getByText('123.45', { exact: true })).toBeVisible();
    expect(statsAttempts).toBe(2);
    expect(priceAttempts).toBe(1);
    expect(requests.get('AAA prices')).toBe(1);
    expect(requests.get('BBB statistics')).toBe(1);
    expect(requests.get('instruments')).toBe(1);
    await app.dispose();
  });

  test('retains unknown URL selections even when the instrument list fails, then retries the list alone', async () => {
    const requests = installMarketHandlers();
    let recovered = false;
    let listAttempts = 0;
    server.use(
      http.get('*/api/instruments', () => {
        listAttempts += 1;
        return recovered
          ? HttpResponse.json(available)
          : HttpResponse.json({ detail: 'do not display me' }, { status: 400 });
      }),
    );
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=UNKNOWN'] });
    expect(await app.view.findByRole('article', { name: 'UNKNOWN market data' })).toBeVisible();
    const instruments = within(app.view.getByRole('region', { name: 'Comparison controls' }));
    expect(await instruments.findByRole('alert')).toHaveTextContent(
      'The service could not complete the request.',
    );
    expect(
      await within(app.view.getByRole('region', { name: 'UNKNOWN prices' })).findByRole('alert'),
    ).toHaveTextContent('Instrument not found.');
    expect(
      await within(app.view.getByRole('region', { name: 'UNKNOWN statistics' })).findByRole(
        'alert',
      ),
    ).toHaveTextContent('Instrument not found.');
    expect(app.view.queryByText(/private\/source|do not display me/)).not.toBeInTheDocument();
    recovered = true;
    await user.click(instruments.getByRole('button', { name: 'Retry instruments' }));
    const options = await openChoices(app, user);
    expect(await options.findByRole('option', { name: 'AAA' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(app.view.getByRole('article', { name: 'UNKNOWN market data' })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('UNKNOWN');
    expect(listAttempts).toBe(2);
    expect(requests.get('UNKNOWN prices')).toBe(1);
    expect(requests.get('UNKNOWN statistics')).toBe(1);
    await app.dispose();
  });

  test('cancels removed resources and never presents their late data beneath the next ticker', async () => {
    installMarketHandlers();
    const gate = createGate();
    const started = new Set<string>();
    const signals = new Map<string, { readonly aborted: boolean }>();
    // MSW's XHR Request representation has no signal forwarding. Observe the
    // consumed Axios signal and the real XHR abort without replacing transport.
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort');
    let stopObserving: (() => void) | undefined;
    const handlers: Promise<Response>[] = [];
    function delayed(name: string, response: Response) {
      started.add(name);
      const pending = gate.promise.then(() => response);
      handlers.push(pending);
      return pending;
    }
    server.use(
      http.get('*/api/prices/AAA', () =>
        delayed('prices', HttpResponse.json([{ date: '2024-01-01', price: 9999 }])),
      ),
      http.get('*/api/prices/AAA/stats', () =>
        delayed(
          'statistics',
          HttpResponse.json({
            totalReturnPercent: 8888,
            dailyVolatilityPercent: 7777,
            maxDrawdownPercent: 6666,
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    try {
      const app = await renderApp({
        configure(current) {
          const observer = current.apiClient.interceptors.request.use((config) => {
            if (config.url?.startsWith('/prices/AAA') && config.signal) {
              signals.set(config.url, config.signal);
            }
            return config;
          });
          stopObserving = () => current.apiClient.interceptors.request.eject(observer);
        },
      });
      await chooseInstrument(app, user, 'AAA');
      await waitFor(() => expect(started).toEqual(new Set(['prices', 'statistics'])));
      expect(signals.size).toBe(2);
      expect([...signals.values()].every((signal) => !signal.aborted)).toBe(true);
      await user.click(app.view.getByRole('button', { name: 'Remove AAA' }));
      await chooseInstrument(app, user, 'BBB');
      const bbbPrices = within(await app.view.findByRole('region', { name: 'BBB prices' }));
      expect(await bbbPrices.findByText('123.45', { exact: true })).toBeVisible();
      await waitFor(() => {
        expect([...signals.values()].every((signal) => signal.aborted)).toBe(true);
        expect(abort).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        gate.release();
        await Promise.all(handlers);
      });
      expect(app.view.queryByRole('article', { name: 'AAA market data' })).not.toBeInTheDocument();
      expect(app.view.queryByText('9,999', { exact: true })).not.toBeInTheDocument();
      expect(app.view.queryByText('8,888%', { exact: true })).not.toBeInTheDocument();
      expect(app.view.queryByText('Request cancelled.')).not.toBeInTheDocument();
      expect(bbbPrices.getByText('123.45', { exact: true })).toBeVisible();
      await app.dispose();
    } finally {
      stopObserving?.();
      abort.mockRestore();
      gate.release();
      await Promise.all(handlers);
    }
  });
});
