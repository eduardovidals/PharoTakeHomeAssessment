import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/renderApp';
import { server } from '../../../test/mocks/server';
import { getEffectiveChartMode, validateDashboardSearch } from '../../../app/search';
import { useDashboardActions } from './useDashboardActions';

beforeEach(() => {
  server.use(
    http.get('*/api/instruments', () => HttpResponse.json(['AAA', 'BBB', 'CCC', 'DDD'])),
    http.get('*/api/prices/:ticker/stats', () =>
      HttpResponse.json({
        totalReturnPercent: 0,
        dailyVolatilityPercent: null,
        maxDrawdownPercent: 0,
      }),
    ),
    http.get('*/api/prices/:ticker', () => HttpResponse.json([])),
  );
});

function deferredNavigation() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve() {
      if (!release) throw new Error('Expected an initialized navigation gate.');
      release();
    },
  };
}

async function mount(initial = '/') {
  const app = await renderApp({ initialEntries: [initial] });
  const hook = renderHook(() => useDashboardActions(app.router));
  return { ...app, ...hook };
}

describe('one serialized route intention queue', () => {
  it('recomputes same-tick adds and view changes after the preceding real navigation completes', async () => {
    const app = await mount();
    const navigate = app.router.navigate;
    const entered = deferredNavigation();
    const release = deferredNavigation();
    const navigation = vi.spyOn(app.router, 'navigate').mockImplementationOnce(async (options) => {
      entered.resolve();
      await release.promise;
      return navigate(options);
    });
    await act(async () => {
      const first = app.result.current({ type: 'add', ticker: 'AAA' });
      const second = app.result.current({ type: 'add', ticker: 'BBB' });
      const view = app.result.current({ type: 'set-view', view: 'price' });
      await entered.promise;
      try {
        expect(navigation).toHaveBeenCalledTimes(1);
      } finally {
        release.resolve();
      }
      expect(await Promise.all([first, second, view])).toEqual([
        'committed',
        'committed',
        'committed',
      ]);
    });
    expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
      tickers: 'AAA,BBB',
      view: 'price',
    });
    expect(app.history.location.search).toBe('?tickers=AAA%2CBBB&view=price');
  });

  it('rejects a failed navigation for its caller without poisoning the next intention', async () => {
    const app = await mount();
    const failure = new Error('Navigation unavailable');
    vi.spyOn(app.router, 'navigate').mockRejectedValueOnce(failure);
    await act(async () => {
      const results = await Promise.allSettled([
        app.result.current({ type: 'add', ticker: 'AAA' }),
        app.result.current({ type: 'add', ticker: 'BBB' }),
      ]);
      expect(results).toEqual([
        { status: 'rejected', reason: failure },
        { status: 'fulfilled', value: 'committed' },
      ]);
    });
    expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({ tickers: 'BBB' });
  });

  it('does not claim a cancelled commit and reads an intervening external URL for the next action', async () => {
    const app = await mount();
    const navigate = app.router.navigate;
    vi.spyOn(app.router, 'navigate').mockImplementationOnce(async () => {
      await navigate({ to: '/', search: { tickers: 'CCC', view: 'performance' } });
    });
    await act(async () => {
      expect(
        await Promise.all([
          app.result.current({ type: 'add', ticker: 'AAA' }),
          app.result.current({ type: 'add', ticker: 'BBB' }),
        ]),
      ).toEqual(['unchanged', 'committed']);
    });
    expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
      tickers: 'CCC,BBB',
      view: 'performance',
    });
  });

  it('retains explicit mode through history and last removal, and Clear removes both fields', async () => {
    const app = await mount('/?tickers=AAA,BBB&view=price');
    expect(getEffectiveChartMode(validateDashboardSearch(app.router.latestLocation.search))).toBe(
      'price',
    );
    await act(async () => {
      await app.result.current({ type: 'set-view', view: 'performance' });
      await app.result.current({ type: 'remove', tickers: ['AAA', 'BBB'] });
    });
    expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
      view: 'performance',
    });
    await act(async () => {
      await app.result.current({ type: 'clear' });
    });
    expect(app.history.location.search).toBe('');
    await act(async () => {
      app.history.back();
    });
    await waitFor(() =>
      expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
        view: 'performance',
      }),
    );
    await act(async () => {
      app.history.back();
    });
    await waitFor(() =>
      expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
        tickers: 'AAA,BBB',
        view: 'performance',
      }),
    );
    await act(async () => {
      app.history.back();
    });
    await waitFor(() =>
      expect(validateDashboardSearch(app.router.latestLocation.search)).toEqual({
        tickers: 'AAA,BBB',
        view: 'price',
      }),
    );
    await act(async () => {
      app.history.forward();
    });
    await waitFor(() =>
      expect(validateDashboardSearch(app.router.latestLocation.search).view).toBe('performance'),
    );
  });

  it('does not navigate for duplicates, fourth selections, unknown removals or unchanged views', async () => {
    const app = await mount('/?tickers=AAA,BBB,CCC&view=price');
    const navigate = vi.spyOn(app.router, 'navigate');
    await act(async () => {
      expect(await app.result.current({ type: 'add', ticker: 'AAA' })).toBe('unchanged');
      expect(await app.result.current({ type: 'add', ticker: 'DDD' })).toBe('limit');
      expect(await app.result.current({ type: 'remove', tickers: ['UNKNOWN'] })).toBe('unchanged');
      expect(await app.result.current({ type: 'set-view', view: 'price' })).toBe('unchanged');
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
