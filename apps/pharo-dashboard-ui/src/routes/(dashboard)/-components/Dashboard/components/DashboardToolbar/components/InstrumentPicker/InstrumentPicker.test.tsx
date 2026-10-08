import { act, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { instrumentsKey } from '../../../../../../../../api/instruments';
import { renderApp } from '../../../../../../../../test/renderApp';
import { server } from '../../../../../../../../test/mocks/server';

const available = Array.from(
  { length: 23 },
  (_, index) => `TICK${String(index + 1).padStart(4, '0')}`,
);
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
      if (!resolve) throw new Error('Missing response gate');
      resolve();
    },
  };
}
const popup = () => within(document.body);
async function expectActive(input: HTMLElement, ticker: string) {
  const option = await popup().findByRole('option', { name: ticker });
  await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', option.id));
}

// Real Router, Query, client/schema and HTTP owners; only the server data is simulated.
describe('InstrumentPicker with the real URL, cache and request owners', () => {
  test('reaches all candidates locally, preserves typed bytes and distinguishes both clear actions', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    await user.click(input);
    if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(popup().getAllByRole('option')).toHaveLength(23));
    expect(popup().getByRole('option', { name: 'TICK0023' })).toBeInTheDocument();
    expect(
      app.view.queryByRole('navigation', { name: 'Instrument pages' }),
    ).not.toBeInTheDocument();
    await user.type(input, '  tiCk0001  ');
    expect(input).toHaveValue('  tiCk0001  ');
    await waitFor(() => expect(popup().getAllByRole('option')).toHaveLength(1));
    expect(requests).toEqual({ instruments: 1, prices: 0, statistics: 0 });
    await expectActive(input, 'TICK0001');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(input).toHaveValue(''));
    await user.keyboard('{Escape}');
    expect(await app.view.findByRole('button', { name: 'Remove TICK0001' })).toBeVisible();
    expect(input).toHaveValue('');
    await user.type(input, 'no match');
    expect(await popup().findByText('No instruments match your search.')).toBeVisible();
    await user.keyboard('{Escape}');
    await user.click(app.view.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    await user.type(input, '001');
    await user.keyboard('{Escape}');
    await user.click(app.view.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(app.history.location.search).toBe(''));
    expect(input).toHaveValue('001');
    expect(input).toHaveFocus();
    expect(requests).toEqual({ instruments: 1, prices: 1, statistics: 1 });
  }, 10000);

  test('uses ranked active options, respects composition and updates open selection through history', async () => {
    installMarketHandlers(['A', 'AA', 'AB', 'BA']);
    const user = userEvent.setup();
    const app = await renderApp();
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    await user.type(input, ' a ');
    const exact = await popup().findByRole('option', { name: 'A' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', exact.id));
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    fireEvent.keyUp(input, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(app.history.location.search).toBe('');
    fireEvent.compositionEnd(input);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(app.history.location.search).toBe('?tickers=A'));
    await waitFor(() => expect(input).toHaveValue(''));
    await user.type(input, 'AA');
    await expectActive(input, 'AA');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe('A,AA'),
    );
    await waitFor(() => expect(input).toHaveValue(''));
    await user.type(input, 'A');
    await expectActive(input, 'AB');
    await act(async () => {
      app.history.back();
    });
    await waitFor(() =>
      expect(popup().getByRole('option', { name: 'AA' })).toHaveAttribute('aria-selected', 'false'),
    );
    expect(input).toHaveValue('A');
    await act(async () => {
      app.history.forward();
    });
    await waitFor(() =>
      expect(popup().getByRole('option', { name: 'AA' })).toHaveAttribute('aria-selected', 'true'),
    );
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('A');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('composes rapid native additions through the existing queue without losing earlier intentions', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    await user.click(input);
    if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
    const first = await popup().findByRole('option', { name: 'TICK0001' });
    const second = popup().getByRole('option', { name: 'TICK0002' });
    const navigate = app.router.navigate.bind(app.router);
    const gate = createGate();
    const navigation = vi.spyOn(app.router, 'navigate').mockImplementationOnce(async (options) => {
      await gate.promise;
      return navigate(options);
    });
    try {
      await user.click(first);
      await user.click(second);
      expect(app.history.location.search).toBe('');
      await act(async () => {
        gate.release();
      });
      await waitFor(() =>
        expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe(
          'TICK0001,TICK0002',
        ),
      );
      await user.keyboard('{Escape}');
      expect(app.view.getByRole('button', { name: 'Remove TICK0001' })).toBeVisible();
      expect(app.view.getByRole('button', { name: 'Remove TICK0002' })).toBeVisible();
      await waitFor(() => expect(requests).toEqual({ instruments: 1, prices: 2, statistics: 2 }));
    } finally {
      gate.release();
      navigation.mockRestore();
    }
  });

  test('limits only additional choices and keeps survivor identities, cache and removal focus', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=TICK0001,TICK0002,TICK0003'] });
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    const secondTag = app.view.getByRole('row', { name: 'TICK0002' });
    expect(secondTag).toHaveClass('before:border-pharo-chart-2', 'before:border-dashed');
    await user.click(input);
    if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
    const fourth = await popup().findByRole('option', { name: 'TICK0004' });
    expect(fourth).toHaveAttribute('aria-disabled', 'true');
    expect(input).toBeEnabled();
    expect(input).toHaveAccessibleDescription(
      /3\/3.*Up to 3 instruments. Remove one to add another/,
    );
    await user.click(fourth);
    expect(new URLSearchParams(app.history.location.search).get('tickers')).toBe(
      'TICK0001,TICK0002,TICK0003',
    );
    await user.keyboard('{Escape}');
    await user.click(app.view.getByRole('button', { name: 'Remove TICK0001' }));
    expect(secondTag).toHaveClass('before:border-pharo-chart-2');
    await user.click(input);
    if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
    await user.click(await popup().findByRole('option', { name: 'TICK0001' }));
    await user.keyboard('{Escape}');
    expect(app.view.getByRole('row', { name: 'TICK0001' })).toHaveClass(
      'before:border-pharo-chart-1',
    );
    expect(secondTag).toHaveClass('before:border-pharo-chart-2');
    await waitFor(() => expect(requests).toEqual({ instruments: 1, prices: 3, statistics: 3 }));
    await user.click(app.view.getByRole('button', { name: 'Remove TICK0002' }));
    await user.click(app.view.getByRole('button', { name: 'Remove TICK0003' }));
    await user.click(app.view.getByRole('button', { name: 'Remove TICK0001' }));
    await waitFor(() => expect(input).toHaveFocus());
  }, 10000);

  test('keeps unknown tags and draft through list pending/failure, removal and retry', async () => {
    const requests = installMarketHandlers();
    const first = createGate();
    const retry = createGate();
    let attempts = 0;
    server.use(
      http.get('*/api/instruments', async () => {
        attempts += 1;
        await (attempts === 1 ? first.promise : retry.promise);
        return attempts === 1
          ? HttpResponse.json({ detail: 'private failure' }, { status: 400 })
          : HttpResponse.json(available);
      }),
    );
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?tickers=UNKNOWN'] });
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    try {
      expect(input).toBeEnabled();
      expect(
        within(app.view.getByRole('region', { name: 'Comparison controls' })).getByRole('status'),
      ).toHaveTextContent('Loading instruments');
      await user.type(input, '  002  ');
      await act(async () => {
        first.release();
      });
      await user.keyboard('{Escape}');
      expect(await app.view.findByRole('alert')).toHaveTextContent(
        'The service could not complete the request.',
      );
      expect(app.view.queryByText(/private failure/)).not.toBeInTheDocument();
      await user.click(app.view.getByRole('button', { name: 'Remove UNKNOWN' }));
      await waitFor(() => expect(input).toHaveFocus());
      expect(input).toHaveValue('  002  ');
      await user.keyboard('{Escape}');
      await user.click(app.view.getByRole('button', { name: 'Retry instruments' }));
      await waitFor(() => expect(attempts).toBe(2));
      expect(
        within(app.view.getByRole('region', { name: 'Comparison controls' })).getByRole('status'),
      ).toHaveTextContent('Loading instruments');
      await user.click(input);
      if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
      await act(async () => {
        retry.release();
      });
      await waitFor(() =>
        expect(
          popup()
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual(['TICK0002', 'TICK0020', 'TICK0021', 'TICK0022', 'TICK0023']),
      );
      expect(input).toHaveFocus();
      expect(input).toHaveValue('  002  ');
      expect(attempts).toBe(2);
      expect(requests.prices).toBe(1);
      expect(requests.statistics).toBe(1);
    } finally {
      first.release();
      retry.release();
    }
  });

  test('distinguishes no-match and empty collection, retains cached choices during background refresh', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    await user.click(input);
    if (input.getAttribute('aria-expanded') !== 'true') await user.keyboard('{ArrowDown}');
    await popup().findByRole('option', { name: 'TICK0023' });
    const gate = createGate();
    server.use(
      http.get('*/api/instruments', async () => {
        await gate.promise;
        return HttpResponse.json(['TICK0001', 'TICK0002']);
      }),
    );
    try {
      let refresh: Promise<void> | undefined;
      act(() => {
        refresh = app.queryClient.invalidateQueries({ queryKey: instrumentsKey });
      });
      expect(await app.view.findByText('Refreshing instruments…', { exact: false })).toBeVisible();
      expect(popup().getByRole('option', { name: 'TICK0023' })).toBeInTheDocument();
      await act(async () => {
        gate.release();
        await refresh;
      });
      await waitFor(() => expect(popup().getAllByRole('option')).toHaveLength(2));
      expect(input).toHaveFocus();
      await user.type(input, 'missing');
      expect(await popup().findByText('No instruments match your search.')).toBeVisible();
      await user.keyboard('{Enter}');
      expect(input).toHaveValue('missing');
      expect(app.history.location.search).toBe('');
      server.use(http.get('*/api/instruments', () => HttpResponse.json([])));
      await act(async () => {
        await app.queryClient.invalidateQueries({ queryKey: instrumentsKey });
      });
      await user.keyboard('{ArrowDown}');
      expect(await popup().findByText('No instruments are available.')).toBeVisible();
      expect(input).toHaveValue('missing');
      expect(requests.prices).toBe(0);
    } finally {
      gate.release();
    }
  });

  test('preserves a newer draft after held navigation and safely recovers from rejection', async () => {
    const requests = installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp();
    const input = app.view.getByRole('combobox', { name: 'Compare instruments' });
    const gate = createGate();
    const navigate = app.router.navigate.bind(app.router);
    const navigation = vi
      .spyOn(app.router, 'navigate')
      .mockRejectedValueOnce(new Error('private routing cause'))
      .mockImplementationOnce(async (options) => {
        await gate.promise;
        return navigate(options);
      });
    try {
      await user.type(input, '0001');
      await expectActive(input, 'TICK0001');
      await user.keyboard('{Enter}');
      await waitFor(() => expect(navigation).toHaveBeenCalledTimes(1));
      await user.keyboard('{Escape}');
      expect(
        await app.view.findByText('The selection could not be updated. Please try again.'),
      ).toBeVisible();
      expect(input).toHaveValue('0001');
      expect(app.history.location.search).toBe('');
      expect(app.view.queryByText(/private routing cause/)).not.toBeInTheDocument();
      await user.keyboard('{ArrowDown}');
      await expectActive(input, 'TICK0001');
      await user.keyboard('{Enter}');
      await user.clear(input);
      await user.type(input, 'newer');
      await act(async () => {
        gate.release();
      });
      await waitFor(() => expect(app.history.location.search).toBe('?tickers=TICK0001'));
      expect(input).toHaveValue('newer');
      expect(requests).toEqual({ instruments: 1, prices: 1, statistics: 1 });
    } finally {
      gate.release();
      navigation.mockRestore();
    }
  });

  test('Clear selection resets explicit view even when there are no selected keys', async () => {
    installMarketHandlers();
    const user = userEvent.setup();
    const app = await renderApp({ initialEntries: ['/?view=performance'] });
    await user.click(app.view.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(app.history.location.search).toBe(''));
    await user.keyboard('{Escape}');
    expect(app.view.getByRole('radio', { name: 'Price' })).toBeChecked();
  });
});
