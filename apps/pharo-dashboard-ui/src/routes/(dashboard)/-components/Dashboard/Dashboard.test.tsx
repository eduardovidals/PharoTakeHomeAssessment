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
  expect(app.view.getByText(/Remove one to add another\./)).toBeVisible();
}

/** Read a metric through its semantic row and selected column, not card layout. */
function matrixCell(app: AppTest, ticker: string, metric: string) {
  const table = within(app.view.getByRole('table', { name: 'Comparison' }));
  const column = table
    .getAllByRole('columnheader')
    .findIndex((header) => header.textContent?.trim() === ticker);
  const row = table.getByRole('row', { name: new RegExp(`^${metric}(?:\\s|$)`) });
  const cell = within(row).getAllByRole('cell')[column - 1];
  if (!cell) throw new Error(`Missing ${metric} cell for ${ticker}`);
  return cell;
}

function matrixHeaders(app: AppTest) {
  return within(app.view.getByRole('table', { name: 'Comparison' }))
    .getAllByRole('columnheader')
    .map((header) => header.textContent?.trim());
}

describe('Dashboard URL selection and independently owned resources', () => {
  test('owns one pinned comparison date across modes and returns to Latest after clearing', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,BBB'] });
    await waitFor(() => expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45'));
    const loaded = [...requests];
    await user.click(app.view.getByRole('button', { name: 'Previous date' }));
    for (const ticker of ['AAA', 'BBB']) {
      expect(matrixCell(app, ticker, 'Closing price')).toHaveTextContent('100.00');
      expect(matrixCell(app, ticker, 'Total return')).toHaveTextContent('0.00%');
      expect(matrixCell(app, ticker, 'Daily volatility')).toHaveTextContent(
        'Not enough observations',
      );
    }
    await user.click(app.view.getByRole('radio', { name: 'Price' }));
    expect(matrixCell(app, 'AAA', 'Closing price')).toHaveTextContent('100.00');
    expect(app.view.getByRole('button', { name: 'Back to latest' })).toBeVisible();
    expect([...requests]).toEqual(loaded);
    await user.click(app.view.getByRole('button', { name: 'Back to latest' }));
    expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45');
    expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('+23.45%');
    await user.click(app.view.getByRole('button', { name: 'Previous date' }));
    await clearSelection(app, user);
    await chooseInstrument(app, user, 'AAA');
    expect(app.view.queryByRole('button', { name: 'Back to latest' })).not.toBeInTheDocument();
    expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45');
    expect([...requests]).toEqual(loaded);
  });

  test('uses URL mode for the control and preserves fetched resources through explicit view changes', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,BBB'] });
    await waitFor(() =>
      expect(matrixCell(app, 'BBB', 'Total return')).toHaveTextContent('+23.45%'),
    );
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
    expect(matrixCell(app, 'BBB', 'Latest close')).toHaveTextContent('123.45');
    expect(matrixCell(app, 'BBB', 'Total return')).toHaveTextContent('+23.45%');
    expect([...requests]).toEqual(loaded);
    await clearSelection(app, user);
    expect(app.history.location.search).toBe('');
    expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked();
  });

  test('discloses cached raw observations in both views and keeps unavailable selected columns', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA,UNKNOWN'] });
    await waitFor(() => expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45'));
    await app.view.findByText('Not in this dataset');
    const loaded = [...requests];
    for (const mode of ['Performance', 'Price']) {
      if (mode === 'Price') await user.click(app.view.getByRole('radio', { name: mode }));
      await waitFor(() => expect(app.view.getByRole('radio', { name: mode })).toBeChecked());
      const trigger = app.view.getByRole('button', { name: 'View data' });
      await user.click(trigger);
      const dialog = await within(document.body).findByRole('dialog', { name: 'Raw observations' });
      const table = within(within(dialog).getByRole('table', { name: 'Recorded closing prices' }));
      expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
        'Date (UTC)',
        'AAA',
        'UNKNOWN',
      ]);
      expect(table.getAllByRole('rowheader')).toHaveLength(2);
      expect(table.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
        '100.00',
        'Unavailable',
        '123.45',
        'Unavailable',
      ]);
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('+23.45%');
      expect([...requests]).toEqual(loaded);
    }
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
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA']);
    await waitFor(() => expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45'));
    expect(app.view.getByText('2 observations', { exact: true })).toBeVisible();
    expect(app.view.getByText('Mar 10 – Mar 11, 2024 (UTC)', { exact: true })).toBeVisible();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA');
    expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('+23.45%');

    // Final-tag removal returns focus to the input; adding again uses cached data.
    await user.click(app.view.getByRole('button', { name: 'Remove AAA' }));
    await waitFor(() => expect(app.history.location.search).toBe(''));
    expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(app.view.queryByRole('table', { name: 'Comparison' })).not.toBeInTheDocument();
    await chooseInstrument(app, user, 'AAA');
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA']);
    await chooseInstrument(app, user, 'BBB');
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB']);
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB');
    await user.click(app.view.getByRole('button', { name: 'Remove AAA' }));
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'BBB']));
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('BBB');

    await act(async () => app.history.back());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB']));
    expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45');
    await act(async () => app.history.forward());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'BBB']));
    await clearSelection(app, user);
    expect(
      await app.view.findByText('Select an instrument to view its prices and statistics.'),
    ).toBeVisible();
    expect(app.history.location.search).toBe('');
    await act(async () => app.history.back());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'BBB']));
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
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB', 'CCC']);
    await expectLimit(app, user);
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB', 'CCC']);
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
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'CCC', 'DDD']);
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,CCC,DDD');
    await app.dispose();
  }, 10000);

  test('keeps limit feedback accurate when Back and Forward change the URL selection', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({
      initialEntries: ['/?tickers=AAA,BBB', '/?tickers=AAA,BBB,CCC'],
    });
    const notice = /Remove one to add another\./;
    await expectLimit(app, user);
    await act(async () => app.history.back());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB']));
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB');
    expect(app.view.queryByText(notice)).not.toBeInTheDocument();
    await act(async () => app.history.forward());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB', 'CCC']));
    expect(app.view.getByText(notice)).toBeVisible();
    await act(async () => app.history.back());
    await waitFor(() => expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB']));
    await chooseInstrument(app, user, 'DDD');
    expect(matrixHeaders(app)).toEqual(['Metric', 'AAA', 'BBB', 'DDD']);
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('AAA,BBB,DDD');
    expect(app.view.getByText(notice)).toBeVisible();
    await app.dispose();
  });

  test('shows invalid direct-link feedback and recovers through an intentional selection', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=AAA&tickers=BBB'] });
    expect(await app.view.findByText("The link's instrument selection is invalid.")).toBeVisible();
    expect(app.view.queryByRole('table', { name: 'Comparison' })).not.toBeInTheDocument();
    await chooseInstrument(app, user, 'CCC');
    expect(matrixHeaders(app)).toEqual(['Metric', 'CCC']);
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
      expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      const resources = within(app.view.getByRole('group', { name: 'AAA resources' }));
      expect(resources.getByText('Loading prices…', { exact: true })).toBeVisible();
      expect(resources.getByText('Loading statistics…', { exact: true })).toBeVisible();
      expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('Loading…');
      priceGate.release();
      await waitFor(() =>
        expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45'),
      );
      expect(resources.getByText('Loading statistics…', { exact: true })).toBeVisible();
      expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      statsGate.release();
      await waitFor(() =>
        expect(matrixCell(app, 'AAA', 'Daily volatility')).toHaveTextContent(
          'Not enough observations',
        ),
      );
      expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('+23.45%');
      expect(matrixCell(app, 'AAA', 'Max drawdown')).toHaveTextContent('0.00%');
      expect(matrixHeaders(app)).toEqual(['Metric', 'AAA']);
      instrumentGate.release();
      expect(await app.view.findByRole('button', { name: 'Remove AAA' })).toBeVisible();
      await app.dispose();
    } finally {
      instrumentGate.release();
      priceGate.release();
      statsGate.release();
      await Promise.all(handlers);
    }
  }, 10000);

  test('preserves successful siblings and retries only a transient chosen failure with focus', async () => {
    const requests = installMarketHandlers();
    const retryGate = createGate();
    let statsAttempts = 0;
    let priceAttempts = 0;
    let recovered = false;
    server.use(
      http.get('*/api/prices/AAA/stats', async () => {
        statsAttempts += 1;
        if (!recovered)
          return HttpResponse.json({ detail: 'private raw response' }, { status: 503 });
        await retryGate.promise;
        return HttpResponse.json({
          totalReturnPercent: 6,
          dailyVolatilityPercent: 1.5,
          maxDrawdownPercent: 2,
        });
      }),
      http.get('*/api/prices/BBB', () => {
        priceAttempts += 1;
        return HttpResponse.json({ detail: 'another private raw response' }, { status: 503 });
      }),
    );
    const user = userEvent.setup();
    const app = await renderApp({
      initialEntries: ['/?tickers=AAA,BBB'],
      configure(current) {
        const defaults = current.queryClient.getDefaultOptions();
        current.queryClient.setDefaultOptions({
          ...defaults,
          queries: { ...defaults.queries, retryDelay: 0 },
        });
      },
    });
    try {
      await waitFor(() => expect(statsAttempts).toBe(3));
      await waitFor(() => expect(priceAttempts).toBe(3));
      const aaaResources = app.view.getByRole('group', { name: 'AAA resources' });
      const bbbResources = within(app.view.getByRole('group', { name: 'BBB resources' }));
      const retry = await within(aaaResources).findByRole('button', {
        name: 'Retry AAA statistics',
      });
      expect(bbbResources.getByRole('button', { name: 'Retry BBB prices' })).toBeVisible();
      expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45');
      expect(matrixCell(app, 'BBB', 'Total return')).toHaveTextContent('+23.45%');
      expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('Unavailable');
      expect(matrixCell(app, 'BBB', 'Latest close')).toHaveTextContent('Unavailable');
      expect(app.view.queryByText(/private raw response/)).not.toBeInTheDocument();
      recovered = true;
      await user.click(retry);
      await waitFor(() => expect(statsAttempts).toBe(4));
      expect(retry).toHaveFocus();
      expect(retry).toHaveAttribute('aria-disabled', 'true');
      expect(retry).toHaveTextContent('Retrying AAA statistics');
      await user.click(retry);
      expect(statsAttempts).toBe(4);
      expect(matrixCell(app, 'AAA', 'Latest close')).toHaveTextContent('123.45');
      await act(async () => retryGate.release());
      await waitFor(() =>
        expect(matrixCell(app, 'AAA', 'Daily volatility')).toHaveTextContent('1.50%'),
      );
      expect(matrixCell(app, 'AAA', 'Total return')).toHaveTextContent('+6.00%');
      expect(matrixCell(app, 'AAA', 'Max drawdown')).toHaveTextContent('2.00%');
      expect(app.view.getByRole('heading', { name: 'Comparison' })).toHaveFocus();
      expect(
        within(aaaResources).queryByRole('button', { name: 'Retry AAA statistics' }),
      ).not.toBeInTheDocument();
      expect(bbbResources.getByRole('button', { name: 'Retry BBB prices' })).toBeVisible();
      expect(statsAttempts).toBe(4);
      expect(priceAttempts).toBe(3);
      expect(requests.get('AAA prices')).toBe(1);
      expect(requests.get('BBB statistics')).toBe(1);
      expect(requests.get('instruments')).toBe(1);
      await app.dispose();
    } finally {
      retryGate.release();
    }
  }, 10000);

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
    expect(matrixHeaders(app)).toEqual(['Metric', 'UNKNOWN']);
    const instruments = within(app.view.getByRole('region', { name: 'Comparison controls' }));
    expect(await instruments.findByRole('alert')).toHaveTextContent(
      'The service could not complete the request.',
    );
    const resources = within(app.view.getByRole('group', { name: 'UNKNOWN resources' }));
    expect(await resources.findByText('Not in this dataset', { exact: true })).toBeVisible();
    expect(resources.getAllByText('Not in this dataset', { exact: true })).toHaveLength(1);
    expect(resources.getByRole('button', { name: 'Remove UNKNOWN from comparison' })).toBeVisible();
    expect(resources.queryByRole('button', { name: /^Retry / })).not.toBeInTheDocument();
    expect(matrixCell(app, 'UNKNOWN', 'Latest close')).toHaveTextContent('Unavailable');
    expect(matrixCell(app, 'UNKNOWN', 'Total return')).toHaveTextContent('Unavailable');
    expect(app.view.queryByText(/private\/source|do not display me/)).not.toBeInTheDocument();
    recovered = true;
    await user.click(instruments.getByRole('button', { name: 'Retry instruments' }));
    const options = await openChoices(app, user);
    expect(await options.findByRole('option', { name: 'AAA' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(matrixHeaders(app)).toEqual(['Metric', 'UNKNOWN']);
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('UNKNOWN');
    expect(listAttempts).toBe(2);
    expect(requests.get('UNKNOWN prices')).toBe(1);
    expect(requests.get('UNKNOWN statistics')).toBe(1);
    await app.dispose();
  });

  test('keeps rejected matrix removal safe and returns committed last-column removal to the picker', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=UNKNOWN'] });
    const remove = await app.view.findByRole('button', { name: 'Remove UNKNOWN from comparison' });
    const navigate = vi
      .spyOn(app.router, 'navigate')
      .mockRejectedValueOnce(new Error('PRIVATE_REMOVE_CAUSE'));
    try {
      await user.click(remove);
      await waitFor(() =>
        expect(
          within(app.view.getByRole('region', { name: 'Comparison' })).getByRole('status'),
        ).toHaveTextContent('Unable to remove this instrument. Please try again.'),
      );
      expect(remove).not.toHaveAttribute('aria-disabled', 'true');
      expect(matrixHeaders(app)).toEqual(['Metric', 'UNKNOWN']);
      expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('UNKNOWN');
      expect(remove).toHaveFocus();
      expect(app.view.queryByText(/PRIVATE_REMOVE_CAUSE/)).not.toBeInTheDocument();
      await user.click(remove);
      await waitFor(() => expect(app.history.location.search).toBe(''));
      await waitFor(() =>
        expect(app.view.getByRole('combobox', { name: 'Compare instruments' })).toHaveFocus(),
      );
      await user.keyboard('{Escape}');
      expect(app.view.queryByRole('table', { name: 'Comparison' })).not.toBeInTheDocument();
      expect(requests.get('UNKNOWN prices')).toBe(1);
      expect(requests.get('UNKNOWN statistics')).toBe(1);
      expect(requests.get('instruments')).toBe(1);
    } finally {
      navigate.mockRestore();
    }
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
      await waitFor(() =>
        expect(matrixCell(app, 'BBB', 'Latest close')).toHaveTextContent('123.45'),
      );
      await waitFor(() => {
        expect([...signals.values()].every((signal) => signal.aborted)).toBe(true);
        expect(abort).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        gate.release();
        await Promise.all(handlers);
      });
      expect(matrixHeaders(app)).toEqual(['Metric', 'BBB']);
      expect(app.view.queryByText('9,999', { exact: true })).not.toBeInTheDocument();
      expect(app.view.queryByText('8,888%', { exact: true })).not.toBeInTheDocument();
      expect(app.view.queryByText('Request cancelled.')).not.toBeInTheDocument();
      expect(matrixCell(app, 'BBB', 'Latest close')).toHaveTextContent('123.45');
      await app.dispose();
    } finally {
      stopObserving?.();
      abort.mockRestore();
      gate.release();
      await Promise.all(handlers);
    }
  });
});
