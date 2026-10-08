import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';

const dateLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const priceLabel = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface Observation {
  date: string;
  price: number;
}

interface NativeXhr {
  timeout: number;
  addEventListener(type: 'timeout', listener: () => void, options: { once: boolean }): void;
}

// These declarations describe browser globals only inside the isolated init script.
declare const XMLHttpRequest: {
  prototype: { send(this: NativeXhr, body?: unknown): void };
};
declare function __pharoRecordXhrTimeout(value: {
  configuredTimeout: number;
  elapsedMs: number;
}): Promise<void>;

async function csvPrices(ticker: string): Promise<Observation[]> {
  const csv = await readFile(
    new URL('../../../pharo-dashboard-api/Data/market_data.csv', import.meta.url),
    'utf8',
  );
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [date, symbol, price] = line.split(',');
      return symbol === ticker && date && price ? [{ date, price: Number(price) }] : [];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function createGate() {
  let open: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    promise,
    release() {
      if (!open) throw new Error('The owned response gate is unavailable.');
      open();
    },
  };
}

function recordRequests(page: Page) {
  const paths: string[] = [];
  const record = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) paths.push(path);
  };
  page.on('request', record);
  return { paths, stop: () => page.off('request', record) };
}

async function retireFault(
  page: Page,
  target: string,
  handler: (route: Route) => Promise<void>,
  gate: ReturnType<typeof createGate>,
  work: readonly Promise<void>[],
  failures: unknown[],
) {
  // Release paused callbacks before any unroute operation that could await them.
  gate.release();
  const settled = await Promise.allSettled(work);
  for (const result of settled) {
    if (result.status === 'rejected') failures.push(result.reason);
  }
  try {
    await page.unroute(target, handler);
  } catch (error) {
    failures.push(error);
  }
}

test.describe('Compare independently cached historical instruments', () => {
  test('overlays all real values for three tickers and retains appearances and cache on A→B→A', async ({
    page,
  }, testInfo) => {
    const tickers = ['TICK0001', 'TICK0002', 'TICK0003'];
    const expected = await Promise.all(tickers.map(csvPrices));
    for (const points of expected) expect(points).toHaveLength(30);
    const requests = recordRequests(page);
    try {
      await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');
      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
      await expect(chart).toBeVisible();
      await expect(
        page.getByText('3 of 3 selected histories available.', { exact: true }),
      ).toBeVisible();
      for (const ticker of tickers) {
        await expect(
          page
            .getByRole('region', { name: `${ticker} statistics`, exact: true })
            .getByText('Total return', { exact: true }),
        ).toBeVisible();
      }
      const appearances = ['primary', 'secondary', 'tertiary'];
      const strokes = ['rgb(37, 99, 235)', 'rgb(124, 58, 237)', 'rgb(180, 83, 9)'];
      const patterns = ['none', '8px, 4px', '2px, 4px'];
      for (const [index, ticker] of tickers.entries()) {
        // e2e-locator: stable public SVG identities associate actual paths and appearances with each ticker.
        const series = chart.locator(`[data-series-id="${ticker}"]`);
        await expect(series).toHaveAttribute('data-appearance', appearances[index] ?? '');
        // e2e-locator: the series-owned path establishes real raw-price geometry and its non-color pattern.
        const line = series.locator('path');
        await expect(line).toHaveAttribute('d', /^M.*L/);
        await expect(line).toHaveCSS('stroke', strokes[index] ?? '');
        await expect(line).toHaveCSS('stroke-dasharray', patterns[index] ?? '');
      }
      await page
        .getByRole('button', { name: 'Show data table for Historical closing prices' })
        .click();
      const table = page.getByRole('table', { name: 'Data for Historical closing prices' });
      await expect(table.getByRole('columnheader')).toHaveText(['Date (UTC)', ...tickers]);
      const dates = expected[0]?.map((point) => point.date) ?? [];
      expect(dates).toHaveLength(30);
      await expect(table.getByRole('rowheader')).toHaveText(
        dates.map((date) => dateLabel.format(new Date(`${date}T00:00:00.000Z`))),
      );
      const cells = dates.flatMap((date) =>
        expected.map((points) => {
          const point = points.find((candidate) => candidate.date === date);
          if (!point) throw new Error('Expected a recorded CSV value for each comparison date.');
          return priceLabel.format(point.price);
        }),
      );
      await expect(table.getByRole('cell')).toHaveText(cells);
      const loaded = [...requests.paths];
      expect(loaded).toHaveLength(7);
      expect(new Set(loaded).size).toBe(7);

      await page.getByRole('button', { name: 'Remove selected TICK0001', exact: true }).click();
      await page.getByRole('button', { name: 'Remove selected TICK0003', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(1);
      // e2e-locator: B is continuously active, so removing its neighbors must not recolor it.
      await expect(chart.locator('[data-series-id="TICK0002"]')).toHaveAttribute(
        'data-appearance',
        'secondary',
      );
      await page.getByRole('button', { name: 'Add TICK0001', exact: true }).click();
      await page.getByRole('button', { name: 'Add TICK0003', exact: true }).click();
      await expect(
        page.getByText('3 of 3 selected histories available.', { exact: true }),
      ).toBeVisible();
      await expect(table.getByRole('columnheader')).toHaveText([
        'Date (UTC)',
        'TICK0002',
        'TICK0001',
        'TICK0003',
      ]);
      for (const [index, ticker] of tickers.entries()) {
        // e2e-locator: returning identities reuse their still-free historical appearance slots.
        await expect(chart.locator(`[data-series-id="${ticker}"]`)).toHaveAttribute(
          'data-appearance',
          appearances[index] ?? '',
        );
      }
      expect(requests.paths).toEqual(loaded);
      await page.screenshot({
        path: testInfo.outputPath('comparison-three-series.png'),
        fullPage: true,
      });
    } finally {
      requests.stop();
    }
  });

  test('retains successful histories beside a real missing instrument and retries only that resource', async ({
    page,
  }) => {
    const requests = recordRequests(page);
    try {
      await page.goto('/?tickers=TICK0001,UNKNOWN,TICK0002');
      await expect(
        page.getByText('2 of 3 selected histories available.', { exact: true }),
      ).toBeVisible();
      const missing = page.getByRole('region', { name: 'UNKNOWN prices', exact: true });
      await expect(missing.getByRole('alert')).toHaveText('Instrument not found.');
      await expect(
        page.getByRole('region', { name: 'UNKNOWN statistics', exact: true }).getByRole('alert'),
      ).toHaveText('Instrument not found.');
      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
      for (const ticker of ['TICK0001', 'TICK0002']) {
        // e2e-locator: a partial comparison retains each successful series' actual path.
        await expect(chart.locator(`[data-series-id="${ticker}"] path`)).toHaveAttribute(
          'd',
          /^M.*L/,
        );
        await expect(
          page
            .getByRole('region', { name: `${ticker} statistics`, exact: true })
            .getByText('Total return', { exact: true }),
        ).toBeVisible();
      }
      const legend = page.getByRole('list', { name: 'Legend for Historical closing prices' });
      await expect(legend.getByText('UNKNOWN', { exact: true })).toBeVisible();
      // e2e-locator: no path or marker may fabricate a zero-valued missing series.
      await expect(
        chart.locator('[data-series-id="UNKNOWN"] path, [data-series-id="UNKNOWN"] circle'),
      ).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Show data table for Historical closing prices' })
        .click();
      const table = page.getByRole('table', { name: 'Data for Historical closing prices' });
      await expect(table.getByRole('columnheader')).toHaveText([
        'Date (UTC)',
        'TICK0001',
        'UNKNOWN',
        'TICK0002',
      ]);
      await expect(table.getByRole('cell', { name: 'Unavailable', exact: true })).toHaveCount(30);
      const loaded = [...requests.paths];
      await missing.getByRole('button', { name: 'Retry UNKNOWN prices', exact: true }).click();
      await expect
        .poll(() => requests.paths.filter((path) => path === '/api/prices/UNKNOWN').length)
        .toBe(2);
      await expect(missing.getByRole('alert')).toHaveText('Instrument not found.');
      expect(requests.paths).toEqual([...loaded, '/api/prices/UNKNOWN']);
      await expect(
        page.getByText('2 of 3 selected histories available.', { exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get('tickers')).toBe('TICK0001,UNKNOWN,TICK0002');
    } finally {
      requests.stop();
    }
  });

  test('cancels an obsolete browser XHR and ignores its held real response after the next ticker loads', async ({
    page,
  }) => {
    const target = '**/api/prices/TICK0001';
    const gate = createGate();
    const work: Promise<void>[] = [];
    const failures: unknown[] = [];
    const cancelled: Request[] = [];
    let heldRequest: Request | undefined;
    let backendReady = false;
    const recordFailure = (request: Request) => cancelled.push(request);
    page.on('requestfailed', recordFailure);
    const handler = (route: Route) => {
      const pending = (async () => {
        heldRequest = route.request();
        const response = await route.fetch();
        try {
          expect(response.status()).toBe(200);
          backendReady = true;
          await gate.promise;
          await route.fulfill({ response });
        } finally {
          await response.dispose();
        }
      })();
      work.push(pending);
      return pending;
    };
    await page.route(target, handler);
    try {
      const expected = await csvPrices('TICK0002');
      const latest = expected.at(-1);
      if (!latest) throw new Error('Expected the real second ticker CSV history.');
      await page.goto('/?tickers=TICK0001');
      await expect.poll(() => backendReady).toBe(true);
      expect(heldRequest?.resourceType()).toBe('xhr');
      await expect(
        page.getByRole('progressbar', { name: 'Loading TICK0001 prices' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Remove selected TICK0001', exact: true }).click();
      await page.getByRole('button', { name: 'Add TICK0002', exact: true }).click();
      const second = page.getByRole('region', { name: 'TICK0002 prices', exact: true });
      await expect(
        second.getByText(priceLabel.format(latest.price), { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => heldRequest !== undefined && cancelled.includes(heldRequest))
        .toBe(true);
      gate.release();
      await Promise.all(work);
      await expect(
        second.getByText(priceLabel.format(latest.price), { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('region', { name: 'TICK0001 prices', exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByText('Request cancelled.', { exact: true })).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get('tickers')).toBe('TICK0002');
      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
      // e2e-locator: the obsolete identity must not leak its delayed path beneath the new ticker.
      await expect(chart.locator('[data-series-id="TICK0001"]')).toHaveCount(0);
    } catch (error) {
      failures.push(error);
    } finally {
      page.off('requestfailed', recordFailure);
      await retireFault(page, target, handler, gate, work, failures);
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'Delayed comparison scenario failed.');
  });

  test('uses the production 10-second native XHR deadline after bounded retries and recovers only prices', async ({
    page,
  }, testInfo) => {
    const testStarted = Date.now();
    const target = '**/api/prices/TICK0001';
    const gate = createGate();
    const work: Promise<void>[] = [];
    const failures: unknown[] = [];
    const faultRequests: Request[] = [];
    const timeouts: unknown[] = [];
    const requests = recordRequests(page);
    const abortWait = new AbortController();
    let faultRetired = false;
    const handler = (route: Route) => {
      const pending = (async () => {
        faultRequests.push(route.request());
        if (faultRequests.length < 3) {
          await route.fulfill({ status: 500, json: { title: 'Deliberate browser fault' } });
          return;
        }
        if (faultRequests.length > 3)
          throw new Error('Unexpected retry beyond the two-retry policy.');
        await gate.promise;
        // Success reaches this only after the real native timeout was observed.
        await route.abort('aborted');
      })();
      work.push(pending);
      return pending;
    };
    await page.exposeFunction('__pharoRecordXhrTimeout', (value: unknown) => {
      timeouts.push(value);
    });
    await page.addInitScript(() => {
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (body) {
        const configuredTimeout = this.timeout;
        const started = Date.now();
        this.addEventListener(
          'timeout',
          () => {
            void __pharoRecordXhrTimeout({ configuredTimeout, elapsedMs: Date.now() - started });
          },
          { once: true },
        );
        // Observe the actual default adapter; never assign timeout or replace native send.
        return send.call(this, body);
      };
    });
    await page.route(target, handler);
    const failedRequest = page
      .waitForEvent('requestfailed', {
        predicate: (request) => request === faultRequests[2],
        signal: abortWait.signal,
        timeout: Math.max(1, testInfo.timeout - (Date.now() - testStarted)),
      })
      .then(
        (request) => ({ request, error: undefined }),
        (error: unknown) => ({ request: undefined, error }),
      );
    try {
      await page.goto('/?tickers=TICK0001');
      const statistics = page.getByRole('region', { name: 'TICK0001 statistics', exact: true });
      await expect(statistics.getByRole('definition').filter({ hasText: '-9.17%' })).toBeVisible();
      const failed = await failedRequest;
      if (failed.error !== undefined) throw failed.error;
      expect(failed.request).toBe(faultRequests[2]);
      const prices = page.getByRole('region', { name: 'TICK0001 prices', exact: true });
      await expect(prices.getByRole('alert')).toHaveText('The request timed out.');
      expect(faultRequests.map((request) => request.resourceType())).toEqual(['xhr', 'xhr', 'xhr']);
      await expect.poll(() => timeouts.length).toBe(1);
      expect(timeouts).toEqual([{ configuredTimeout: 10000, elapsedMs: expect.any(Number) }]);
      expect(requests.paths.filter((path) => path === '/api/prices/TICK0001')).toHaveLength(3);
      expect(requests.paths.filter((path) => path === '/api/prices/TICK0001/stats')).toHaveLength(
        1,
      );
      await testInfo.attach('native-xhr-timeout', {
        body: JSON.stringify({ attempts: 3, nativeTimeouts: timeouts }),
        contentType: 'application/json',
      });

      // Retire exactly this held fault before retrying through the unchanged real API.
      await retireFault(page, target, handler, gate, work, failures);
      faultRetired = true;
      if (failures.length > 0)
        throw new AggregateError(failures.splice(0), 'Fault retirement failed.');
      await prices.getByRole('button', { name: 'Retry TICK0001 prices', exact: true }).click();
      await expect(prices.getByText('172.89', { exact: true })).toBeVisible();
      await expect(prices.getByText('Aug 3, 2026', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('img', { name: 'Historical closing prices', exact: true }),
      ).toBeVisible();
      await expect(statistics.getByRole('definition').filter({ hasText: '-9.17%' })).toBeVisible();
      expect(requests.paths.filter((path) => path === '/api/prices/TICK0001')).toHaveLength(4);
      expect(requests.paths.filter((path) => path === '/api/prices/TICK0001/stats')).toHaveLength(
        1,
      );
      expect(requests.paths.filter((path) => path === '/api/instruments')).toHaveLength(1);
    } catch (error) {
      failures.push(error);
    } finally {
      requests.stop();
      abortWait.abort();
      await failedRequest;
      if (!faultRetired) await retireFault(page, target, handler, gate, work, failures);
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'Native XHR timeout scenario failed.');
  });
});
