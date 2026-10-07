import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { instrumentsKey } from '../../../../api/instruments';
import { renderApp } from '../../../../test/renderApp';
import { server } from '../../../../test/mocks/server';

const available = [
  'TICK0001',
  'TICK0002',
  'TICK0003',
  'TICK0004',
  'TICK0005',
  'TICK0006',
  'TICK0007',
  'TICK0008',
  'TICK0009',
  'TICK0010',
  'TICK0011',
  'TICK0012',
  'TICK0013',
  'TICK0014',
  'TICK0015',
  'TICK0016',
  'TICK0017',
  'TICK0018',
  'TICK0019',
  'TICK0020',
  'TICK0021',
  'TICK0022',
  'TICK0023',
];

function installMarketHandlers(instruments: readonly string[] = available) {
  const requests = { instruments: 0, prices: 0, statistics: 0 };
  server.use(
    http.get('*/api/instruments', () => {
      requests.instruments += 1;
      return HttpResponse.json(instruments);
    }),
    http.get('*/api/prices/:ticker/stats', () => {
      requests.statistics += 1;
      return HttpResponse.json({
        totalReturnPercent: 0,
        dailyVolatilityPercent: null,
        maxDrawdownPercent: 0,
      });
    }),
    http.get('*/api/prices/:ticker', () => {
      requests.prices += 1;
      // Selection tests exercise real queries without requiring chart geometry.
      return HttpResponse.json([]);
    }),
  );
  return requests;
}

function createGate() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return {
    promise,
    release() {
      if (!resolve) throw new Error('The owned response gate is unavailable.');
      resolve();
    },
  };
}

describe('InstrumentSelector with the real URL, form, cache and HTTP owners', () => {
  test('reaches every page, resets filtering, and keeps browsing entirely local', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const list = within(await app.view.findByRole('list', { name: 'Instrument results' }));
    expect(list.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add TICK0001',
      'Add TICK0002',
      'Add TICK0003',
      'Add TICK0004',
      'Add TICK0005',
      'Add TICK0006',
      'Add TICK0007',
      'Add TICK0008',
      'Add TICK0009',
      'Add TICK0010',
    ]);
    expect(app.view.getByText('Showing 1–10 of 23 instruments. Page 1 of 3.')).toBeVisible();
    expect(app.view.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(app.view.getByRole('button', { name: 'Next page' }));
    expect(list.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add TICK0011',
      'Add TICK0012',
      'Add TICK0013',
      'Add TICK0014',
      'Add TICK0015',
      'Add TICK0016',
      'Add TICK0017',
      'Add TICK0018',
      'Add TICK0019',
      'Add TICK0020',
    ]);
    expect(app.view.getByRole('button', { name: 'Add TICK0011' })).toHaveFocus();
    expect(app.view.getByText('Showing 11–20 of 23 instruments. Page 2 of 3.')).toBeVisible();
    await user.click(app.view.getByRole('button', { name: 'Next page' }));
    expect(list.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add TICK0021',
      'Add TICK0022',
      'Add TICK0023',
    ]);
    expect(app.view.getByRole('button', { name: 'Add TICK0021' })).toHaveFocus();
    expect(app.view.getByText('Showing 21–23 of 23 instruments. Page 3 of 3.')).toBeVisible();
    expect(app.view.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await user.click(app.view.getByRole('button', { name: 'Previous page' }));
    expect(app.view.getByRole('button', { name: 'Add TICK0011' })).toHaveFocus();

    const search = app.view.getByRole('textbox', { name: 'Search instruments' });
    await user.type(search, '  tick001  ');
    expect(search).toHaveValue('  tick001  ');
    expect(search).toHaveFocus();
    expect(app.view.getByText('Showing 1–10 of 10 instruments. Page 1 of 1.')).toBeVisible();
    expect(list.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add TICK0010',
      'Add TICK0011',
      'Add TICK0012',
      'Add TICK0013',
      'Add TICK0014',
      'Add TICK0015',
      'Add TICK0016',
      'Add TICK0017',
      'Add TICK0018',
      'Add TICK0019',
    ]);
    await user.click(app.view.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(app.view.getByText('Showing 1–10 of 23 instruments. Page 1 of 3.')).toBeVisible();
    expect(app.history.location.search).toBe('');
    expect(requests).toEqual({ instruments: 1, prices: 0, statistics: 0 });
    await app.dispose();
  });

  test('keeps clear actions separate and focuses adjacent chips, including unknown selection', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({
      initialEntries: ['/?tickers=TICK0001,TICK0002,UNKNOWN'],
    });
    await app.view.findByRole('button', { name: 'Remove TICK0001' });
    await waitFor(() => expect(requests).toEqual({ instruments: 1, prices: 3, statistics: 3 }));
    const search = app.view.getByRole('textbox', { name: 'Search instruments' });
    await user.type(search, '0001');
    expect(app.view.getByRole('button', { name: 'Remove selected UNKNOWN' })).toBeVisible();
    await user.click(app.view.getByRole('button', { name: 'Clear search' }));
    expect(app.history.location.search).toBe('?tickers=TICK0001,TICK0002,UNKNOWN');
    await user.type(search, '  0001 ');
    await user.click(app.view.getByRole('button', { name: 'Remove selected TICK0002' }));
    await waitFor(() =>
      expect(app.view.getByRole('button', { name: 'Remove selected UNKNOWN' })).toHaveFocus(),
    );
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe(
      'TICK0001,UNKNOWN',
    );
    expect(search).toHaveValue('  0001 ');
    await user.click(app.view.getByRole('button', { name: 'Remove selected UNKNOWN' }));
    await waitFor(() =>
      expect(app.view.getByRole('button', { name: 'Remove selected TICK0001' })).toHaveFocus(),
    );
    await user.click(app.view.getByRole('button', { name: 'Remove selected TICK0001' }));
    await waitFor(() => expect(search).toHaveFocus());
    expect(search).toHaveValue('  0001 ');
    expect(app.history.location.search).toBe('');
    await user.click(app.view.getByRole('button', { name: 'Add TICK0001' }));
    await app.view.findByRole('button', { name: 'Clear selection' });
    await user.click(app.view.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(search).toHaveFocus());
    expect(search).toHaveValue('  0001 ');
    expect(app.history.location.search).toBe('');
    expect(requests).toEqual({ instruments: 1, prices: 3, statistics: 3 });
    await app.dispose();
  });

  test('keeps a surviving result focused and retains history-driven selection and limit feedback', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({
      initialEntries: ['/?tickers=TICK0001,TICK0002', '/?tickers=TICK0001,TICK0002,TICK0003'],
    });
    const limit = 'You can compare up to three instruments. Remove one before adding another.';
    await user.click(await app.view.findByRole('button', { name: 'Add TICK0004' }));
    expect(await app.view.findByText(limit)).toBeVisible();
    expect(app.history.location.search).toBe('?tickers=TICK0001,TICK0002,TICK0003');
    await act(async () => app.history.back());
    await waitFor(() => expect(app.view.queryByText(limit)).not.toBeInTheDocument());
    await act(async () => app.history.forward());
    expect(await app.view.findByText(limit)).toBeVisible();
    await user.click(app.view.getByRole('button', { name: 'Remove TICK0002' }));
    const survivingRow = await app.view.findByRole('button', { name: 'Add TICK0002' });
    expect(survivingRow).toHaveFocus();
    expect(app.view.queryByText(limit)).not.toBeInTheDocument();
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe(
      'TICK0001,TICK0003',
    );
    await user.click(app.view.getByRole('button', { name: 'Add TICK0004' }));
    await app.view.findByRole('button', { name: 'Remove selected TICK0004' });
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe(
      'TICK0001,TICK0003,TICK0004',
    );
    await waitFor(() => expect(requests).toEqual({ instruments: 1, prices: 4, statistics: 4 }));
    await app.dispose();
  });

  test('preserves the enabled draft through pending, failure, last-chip removal and list retry', async () => {
    const requests = installMarketHandlers();
    const gate = createGate();
    const recovery = createGate();
    const held: Promise<Response>[] = [];
    let attempts = 0;
    server.use(
      http.get('*/api/instruments', () => {
        attempts += 1;
        const response =
          attempts === 1
            ? gate.promise.then(() =>
                HttpResponse.json({ detail: 'private details must stay hidden' }, { status: 400 }),
              )
            : recovery.promise.then(() => HttpResponse.json(available));
        held.push(response);
        return response;
      }),
    );
    const user = userEvent.setup();
    try {
      const app = await renderApp({ initialEntries: ['/?tickers=TICK0001'] });
      const selector = within(app.view.getByRole('region', { name: 'Available instruments' }));
      const search = selector.getByRole('textbox', { name: 'Search instruments' });
      expect(selector.getByRole('progressbar', { name: 'Loading instruments' })).toBeVisible();
      expect(search).toBeEnabled();
      await user.type(search, '  002  ');
      expect(selector.queryByRole('list', { name: 'Instrument results' })).not.toBeInTheDocument();
      expect(
        selector.queryByRole('navigation', { name: 'Instrument pages' }),
      ).not.toBeInTheDocument();
      expect(selector.queryByText('No instruments match your search.')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(attempts).toBe(1);
        expect(requests.prices).toBe(1);
        expect(requests.statistics).toBe(1);
      });
      await act(async () => {
        gate.release();
        await Promise.all(held);
      });
      expect(await selector.findByRole('alert')).toHaveTextContent(
        'The service could not complete the request.',
      );
      expect(search).toBeEnabled();
      expect(search).toHaveValue('  002  ');
      expect(selector.queryByText(/private details/)).not.toBeInTheDocument();
      expect(selector.queryByRole('navigation')).not.toBeInTheDocument();
      await user.click(selector.getByRole('button', { name: 'Remove selected TICK0001' }));
      await waitFor(() => expect(search).toHaveFocus());
      expect(search).toHaveValue('  002  ');
      const retry = selector.getByRole('button', { name: 'Retry instruments' });
      await user.click(retry);
      await waitFor(() => expect(attempts).toBe(2));
      // Returning to editing is the user's action; a recovered list must not steal it.
      await user.click(search);
      await act(async () => {
        recovery.release();
        await Promise.all(held);
      });
      const results = within(await selector.findByRole('list', { name: 'Instrument results' }));
      expect(
        results.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
      ).toEqual(['Add TICK0002', 'Add TICK0020', 'Add TICK0021', 'Add TICK0022', 'Add TICK0023']);
      expect(search).toHaveFocus();
      expect(search).toHaveValue('  002  ');
      expect(attempts).toBe(2);
      expect(requests.prices).toBe(1);
      expect(requests.statistics).toBe(1);
      expect(app.history.location.search).toBe('');
      await app.dispose();
    } finally {
      gate.release();
      recovery.release();
      await Promise.all(held);
    }
  });

  test('distinguishes empty data and no match, and clamps a smaller refreshed result set', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    await app.view.findByRole('button', { name: 'Next page' });
    await user.click(app.view.getByRole('button', { name: 'Next page' }));
    await user.click(app.view.getByRole('button', { name: 'Next page' }));
    const search = app.view.getByRole('textbox', { name: 'Search instruments' });
    await user.click(search);
    server.use(http.get('*/api/instruments', () => HttpResponse.json(['TICK0001', 'TICK0002'])));
    await act(async () => {
      await app.queryClient.invalidateQueries({ queryKey: instrumentsKey });
    });
    expect(await app.view.findByText('Showing 1–2 of 2 instruments. Page 1 of 1.')).toBeVisible();
    expect(search).toHaveFocus();
    await user.type(search, 'missing');
    expect(app.view.getByText('No instruments match your search.')).toBeVisible();
    expect(app.view.queryByRole('list', { name: 'Instrument results' })).not.toBeInTheDocument();
    expect(
      app.view.queryByRole('navigation', { name: 'Instrument pages' }),
    ).not.toBeInTheDocument();
    server.use(http.get('*/api/instruments', () => HttpResponse.json([])));
    await act(async () => {
      await app.queryClient.invalidateQueries({ queryKey: instrumentsKey });
    });
    expect(await app.view.findByText('No instruments are available.')).toBeVisible();
    expect(app.view.queryByText('No instruments match your search.')).not.toBeInTheDocument();
    expect(search).toHaveValue('missing');
    expect(search).toHaveFocus();
    expect(requests.prices).toBe(0);
    expect(requests.statistics).toBe(0);
    await app.dispose();
  });

  test('shows a safe navigation failure without committing selection or exposing its cause', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const add = await app.view.findByRole('button', { name: 'Add TICK0001' });
    const navigate = vi
      .spyOn(app.router, 'navigate')
      .mockRejectedValueOnce(new Error('private routing cause'));
    try {
      await user.click(add);
      expect(
        await app.view.findByText('The selection could not be updated. Please try again.'),
      ).toBeVisible();
      expect(app.view.queryByText(/private routing cause/)).not.toBeInTheDocument();
      expect(app.history.location.search).toBe('');
      expect(requests).toEqual({ instruments: 1, prices: 0, statistics: 0 });
    } finally {
      navigate.mockRestore();
      await app.dispose();
    }
  });
});
