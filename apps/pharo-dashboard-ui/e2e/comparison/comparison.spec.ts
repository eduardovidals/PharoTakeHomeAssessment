import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';
import { priceSeriesSchema, priceStatsSchema } from '../../src/api/prices/schema';
import { getHistoricalComparison } from '../../src/routes/(dashboard)/-components/Dashboard/components/ComparisonMatrix/calculations/utils';
import { formatPercentage, formatSignedPercentage } from '../../src/utils/number';

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

async function matrixCell(page: Page, ticker: string, metric: string) {
  const table = page.getByRole('table', { name: 'Comparison', exact: true });

  await expect(table.getByRole('columnheader', { name: ticker, exact: true })).toBeVisible();

  const headers = await table.getByRole('columnheader').allTextContents();
  const index = headers.findIndex((header) => header.trim() === ticker) - 1;
  if (index < 0) throw new Error(`Expected a comparison column for ${ticker}.`);
  const row = table.getByRole('row').filter({
    has: page.getByRole('rowheader', { name: metric, exact: true }),
  });
  // e2e-ordinal: The native column headers establish this URL-selected ticker's value position.
  return row.getByRole('cell').nth(index);
}

async function chooseInstrument(page: Page, ticker: string) {
  const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

  await input.fill(ticker);
  if ((await input.getAttribute('aria-expanded')) !== 'true') await input.press('ArrowDown');
  await page.getByRole('option', { name: ticker, exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tickers')?.split(','))
    .toContain(ticker);

  await expect(input).toHaveValue('');

  await input.press('Escape');
}

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
      await page.goto('/?tickers=TICK0001,TICK0002,TICK0003&view=price');

      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });

      await expect(chart).toBeVisible();
      await ready(page, tickers);
      await expect(
        page.getByRole('table', { name: 'Comparison', exact: true }).getByRole('columnheader'),
      ).toHaveText(['Metric', ...tickers]);

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

      await page.getByRole('button', { name: 'View data', exact: true }).click();
      const table = page.getByRole('table', { name: 'Recorded closing prices' });

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

      await page
        .getByRole('dialog', { name: 'Raw observations', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();

      await page.getByRole('button', { name: 'Remove TICK0001', exact: true }).click();
      await page.getByRole('button', { name: 'Remove TICK0003', exact: true }).click();

      await expect(
        page.getByRole('table', { name: 'Comparison', exact: true }).getByRole('columnheader'),
      ).toHaveText(['Metric', 'TICK0002']);
      // e2e-locator: B is continuously active, so removing its neighbors must not recolor it.
      await expect(chart.locator('[data-series-id="TICK0002"]')).toHaveAttribute(
        'data-appearance',
        'secondary',
      );

      await chooseInstrument(page, 'TICK0001');
      await chooseInstrument(page, 'TICK0003');

      await ready(page, tickers);

      await page.getByRole('button', { name: 'View data', exact: true }).click();

      await expect(table.getByRole('columnheader')).toHaveText([
        'Date (UTC)',
        'TICK0002',
        'TICK0001',
        'TICK0003',
      ]);

      await page
        .getByRole('dialog', { name: 'Raw observations', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();

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

  test('retains successful histories and cached resources while removing a real missing instrument', async ({
    page,
  }) => {
    const requests = recordRequests(page);
    try {
      await page.goto('/?tickers=TICK0001,UNKNOWN,TICK0002&view=price');

      await expect(page.getByText('Available histories: 2 of 3.', { exact: true })).toBeVisible();

      const missing = page.getByRole('group', { name: 'UNKNOWN resources', exact: true });

      await expect(missing.getByText('Not in this dataset', { exact: true })).toHaveCount(1);
      await expect(missing.getByRole('button', { name: /Retry/ })).toHaveCount(0);

      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });

      for (const ticker of ['TICK0001', 'TICK0002']) {
        // e2e-locator: a partial comparison retains each successful series' actual path.
        await expect(chart.locator(`[data-series-id="${ticker}"] path`)).toHaveAttribute(
          'd',
          /^M.*L/,
        );
        await expect(await matrixCell(page, ticker, 'Total return')).toHaveText(/^-\d+\.\d{2}%$/);
      }

      const legend = page.getByRole('list', { name: 'Legend for Historical closing prices' });

      await expect(legend.getByText('UNKNOWN', { exact: true })).toBeVisible();
      // e2e-locator: no path or marker may fabricate a zero-valued missing series.
      await expect(
        chart.locator('[data-series-id="UNKNOWN"] path, [data-series-id="UNKNOWN"] circle'),
      ).toHaveCount(0);

      await page.getByRole('button', { name: 'View data', exact: true }).click();
      const table = page.getByRole('table', { name: 'Recorded closing prices' });

      await expect(table.getByRole('columnheader')).toHaveText([
        'Date (UTC)',
        'TICK0001',
        'UNKNOWN',
        'TICK0002',
      ]);
      await expect(table.getByRole('cell', { name: 'Unavailable', exact: true })).toHaveCount(30);

      await page
        .getByRole('dialog', { name: 'Raw observations', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      const loaded = [...requests.paths];
      const chartInstance = await chart.elementHandle();
      if (!chartInstance) throw new Error('Expected the healthy chart instance.');
      await missing
        .getByRole('button', { name: 'Remove UNKNOWN from comparison', exact: true })
        .click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get('tickers'))
        .toBe('TICK0001,TICK0002');
      const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

      await expect(input).toBeFocused();

      await input.press('Escape');

      await expect(missing).toHaveCount(0);
      await ready(page, ['TICK0001', 'TICK0002']);
      expect(await chartInstance.evaluate((element) => element.isConnected)).toBe(true);
      expect(requests.paths).toEqual(loaded);
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
        page
          .getByRole('group', { name: 'TICK0001 resources', exact: true })
          .getByText('Loading prices…', { exact: true }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Remove TICK0001', exact: true }).click();
      await chooseInstrument(page, 'TICK0002');

      await expect(await matrixCell(page, 'TICK0002', 'Latest close')).toHaveText(
        priceLabel.format(latest.price),
      );

      await expect
        .poll(() => heldRequest !== undefined && cancelled.includes(heldRequest))
        .toBe(true);
      gate.release();
      await Promise.all(work);

      await expect(await matrixCell(page, 'TICK0002', 'Latest close')).toHaveText(
        priceLabel.format(latest.price),
      );
      await expect(
        page
          .getByRole('table', { name: 'Comparison', exact: true })
          .getByRole('columnheader', { name: 'TICK0001', exact: true }),
      ).toHaveCount(0);
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

      await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');

      const failed = await failedRequest;
      if (failed.error !== undefined) throw failed.error;
      expect(failed.request).toBe(faultRequests[2]);

      const prices = page.getByRole('group', { name: 'TICK0001 resources', exact: true });

      await expect(
        prices.getByText('Prices: The request timed out.', { exact: true }),
      ).toBeVisible();
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
      await prices
        .getByRole('button', { name: 'Retry TICK0001 prices', exact: true })
        .press('Enter');

      await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
      await expect(page.getByText('Jun 23 – Aug 3, 2026 (UTC)', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Comparison', exact: true })).toBeFocused();
      await expect(
        page.getByRole('img', { name: 'Historical closing prices', exact: true }),
      ).toBeVisible();
      await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');
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

  test('retains keyboard retry focus while statistics recover without replacing healthy prices', async ({
    page,
  }, testInfo) => {
    const target = '**/api/prices/TICK0001/stats';
    const gate = createGate();
    const work: Promise<void>[] = [];
    const failures: unknown[] = [];
    const requests = recordRequests(page);
    let fail = true;
    let recoveryReady = false;
    const handler = (route: Route) => {
      const pending = (async () => {
        if (fail) {
          await route.fulfill({ status: 500, json: { title: 'Deliberate statistics fault' } });
          return;
        }
        const response = await route.fetch();
        try {
          expect(response.status()).toBe(200);

          recoveryReady = true;
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
      await page.goto('/?tickers=TICK0001');

      await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');

      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
      const instance = await chart.elementHandle();
      if (!instance) throw new Error('Expected the healthy chart instance.');
      const retry = page.getByRole('button', { name: 'Retry TICK0001 statistics', exact: true });

      await expect(retry).toBeVisible();

      const loaded = [...requests.paths];

      expect(loaded.filter((path) => path === '/api/prices/TICK0001/stats')).toHaveLength(3);

      fail = false;
      await retry.press('Enter');

      const pending = page.getByRole('button', {
        name: 'Retrying TICK0001 statistics',
        exact: true,
      });

      await expect.poll(() => recoveryReady).toBe(true);
      await expect(pending).toBeFocused();
      await expect(pending).toHaveAttribute('aria-disabled', 'true');
      await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
      expect(await instance.evaluate((element) => element.isConnected)).toBe(true);

      await page.screenshot({
        path: testInfo.outputPath('statistics-retry-retains-focus.png'),
        fullPage: true,
      });
      gate.release();

      await ready(page, ['TICK0001']);
      await expect(page.getByRole('heading', { name: 'Comparison', exact: true })).toBeFocused();
      expect(requests.paths).toEqual([...loaded, '/api/prices/TICK0001/stats']);
      expect(await instance.evaluate((element) => element.isConnected)).toBe(true);
    } catch (error) {
      failures.push(error);
    } finally {
      requests.stop();
      await retireFault(page, target, handler, gate, work, failures);
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'Statistics retry focus scenario failed.');
  });
});

async function ready(page: Page, tickers: readonly string[]) {
  for (const ticker of tickers) {
    await expect(await matrixCell(page, ticker, 'Latest close')).toHaveText(/^[\d,]+\.\d{2}$/);
    await expect(await matrixCell(page, ticker, 'Total return')).toHaveText(/^[+−-]?\d+\.\d{2}%$/);
  }
}

async function expectIdentity(
  page: Page,
  label: string,
  ticker: string,
  appearance: string,
  color: string,
  dash: string,
) {
  const chip = page
    .getByRole('grid', { name: 'Selected items', exact: true })
    .getByRole('row', { name: ticker, exact: true });
  const heading = page
    .getByRole('table', { name: 'Comparison', exact: true })
    .getByRole('columnheader', { name: ticker, exact: true });
  // e2e-locator: The tag's decorative pseudo-element uses the same token color and a non-color line pattern.
  const mark = await chip.evaluate((element) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element, '::before');
    return {
      color: style?.borderTopColor,
      pattern: style?.borderTopStyle,
      width: style?.borderTopWidth,
    };
  });

  expect(mark).toEqual({
    color,
    pattern: appearance === 'primary' ? 'solid' : appearance === 'secondary' ? 'dashed' : 'dotted',
    width: '2px',
  });

  // e2e-locator: Explicit series identity links actual plotted paths to the matching named chip and matrix column.
  const plotted = page
    .getByRole('img', { name: label, exact: true })
    .locator(`[data-series-id="${ticker}"]`);

  await expect(plotted).toHaveAttribute('data-appearance', appearance);
  // e2e-locator: The hidden SVG marks are decorative identity cues; compare their real stroke roles with the plotted path.
  for (const line of [plotted.locator('path'), heading.locator('svg')]) {
    await expect(line).toHaveCSS('stroke', color);
    await expect(line).toHaveCSS('stroke-dasharray', dash);
  }
}

test.describe('Compare raw prices and rebased change with shared identities', () => {
  test('keeps mode in history, preserves inspection and identities, and does no presentation refetch', async ({
    page,
  }, testInfo) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) requests.push(path);
    });
    const raw = await csvPrices('TICK0001');

    expect(raw).toHaveLength(30);

    const first = raw.at(0);
    const latest = raw.at(-1);
    if (!first || !latest) throw new Error('Expected recorded CSV endpoints.');
    const returnLabel =
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: 'exceptZero',
      }).format(100 * (latest.price / first.price - 1)) + '%';
    const choice = page.getByRole('radiogroup', { name: 'Chart view' });

    await page.goto('/');

    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();

    await chooseInstrument(page, 'TICK0001');

    await ready(page, ['TICK0001']);
    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();

    await chooseInstrument(page, 'TICK0002');

    await ready(page, ['TICK0001', 'TICK0002']);
    await expect(choice.getByRole('radio', { name: 'Performance', exact: true })).toBeChecked();
    expect(new URL(page.url()).searchParams.has('view')).toBe(false);

    await chooseInstrument(page, 'TICK0003');

    await ready(page, ['TICK0001', 'TICK0002', 'TICK0003']);

    const loaded = [...requests];

    expect(loaded).toHaveLength(7);

    const matrix = page.getByRole('table', { name: 'Comparison', exact: true });
    const fullWindowValues = await matrix.getByRole('cell').allTextContents();

    await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
    await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText(returnLabel);

    await expectIdentity(
      page,
      'Rebased price change',
      'TICK0002',
      'secondary',
      'rgb(124, 58, 237)',
      '8px, 4px',
    );
    const detail = page.getByRole('region', {
      name: 'Details for Rebased price change',
      exact: true,
    });

    await expect(detail.getByText(returnLabel, { exact: true })).toBeVisible();

    // e2e-locator: The numeric reference line must be present only for Performance.
    const baseline = page
      .getByRole('img', { name: 'Rebased price change', exact: true })
      .locator('[data-chart-baseline="0"]');

    await expect(baseline).toHaveCount(1);
    await expect(baseline).toHaveCSS('stroke-width', '1px');
    await expect(baseline).not.toHaveCSS('stroke', 'none');

    await page.screenshot({ path: testInfo.outputPath('three-performance.png'), fullPage: true });
    await choice.getByText('Price', { exact: true }).click();

    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();
    expect(new URL(page.url()).searchParams.get('view')).toBe('price');

    const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
    const instance = await chart.elementHandle();
    if (!instance) throw new Error('Expected the existing chart instance.');
    const inspector = page.getByRole('slider', {
      name: 'Inspect Historical closing prices',
      exact: true,
    });

    await inspector.press('Home');
    await inspector.press('ArrowRight');

    const pinnedValues = await matrix.getByRole('cell').allTextContents();

    expect(pinnedValues).not.toEqual(fullWindowValues);

    await choice.getByText('Performance', { exact: true }).click();

    await expect(
      page.getByRole('slider', { name: 'Inspect Rebased price change', exact: true }),
    ).toHaveValue('1');
    expect(await instance.evaluate((element) => element.isConnected)).toBe(true);
    await expect(matrix.getByRole('cell')).toHaveText(pinnedValues);

    await page.getByRole('button', { name: 'Back to latest', exact: true }).click();

    await expect(matrix.getByRole('cell')).toHaveText(fullWindowValues);

    await page.getByRole('button', { name: 'View data', exact: true }).click();
    const performanceTable = page.getByRole('table', {
      name: 'Recorded closing prices',
      exact: true,
    });

    await expect(performanceTable.getByRole('rowheader')).toHaveCount(30);

    const rawHistories = await Promise.all(['TICK0001', 'TICK0002', 'TICK0003'].map(csvPrices));
    const rawCells = raw.flatMap(({ date }) =>
      rawHistories.map((history) => {
        const point = history.find((candidate) => candidate.date === date);
        if (!point) throw new Error('Expected each real CSV observation in the raw dialog.');
        return priceLabel.format(point.price);
      }),
    );

    await expect(performanceTable.getByRole('cell')).toHaveText(rawCells);

    const dialog = page.getByRole('dialog', { name: 'Raw observations', exact: true });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await choice.getByText('Price', { exact: true }).click();

    // e2e-locator: Raw-price view omits the generic zero reference without changing its observations.
    await expect(chart.locator('[data-chart-baseline]')).toHaveCount(0);

    await page.getByRole('button', { name: 'View data', exact: true }).click();

    await expect(performanceTable.getByRole('cell')).toHaveText(rawCells);

    await page.screenshot({ path: testInfo.outputPath('three-price-data.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goBack();

    await expect(choice.getByRole('radio', { name: 'Performance', exact: true })).toBeChecked();

    await page.goForward();

    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();
    expect(requests).toEqual(loaded);

    await page.getByRole('button', { name: 'Remove TICK0001', exact: true }).click();
    await expectIdentity(
      page,
      'Historical closing prices',
      'TICK0002',
      'secondary',
      'rgb(124, 58, 237)',
      '8px, 4px',
    );
    await chooseInstrument(page, 'TICK0001');

    await ready(page, ['TICK0001', 'TICK0002', 'TICK0003']);

    await expectIdentity(
      page,
      'Historical closing prices',
      'TICK0001',
      'primary',
      'rgb(37, 99, 235)',
      'none',
    );
    await expectIdentity(
      page,
      'Historical closing prices',
      'TICK0002',
      'secondary',
      'rgb(124, 58, 237)',
      '8px, 4px',
    );

    expect(new URL(page.url()).searchParams.get('tickers')).toBe('TICK0002,TICK0003,TICK0001');
    expect(requests).toEqual(loaded);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath('returned-identity-mobile.png'),
      fullPage: true,
    });
    await page.reload();

    await ready(page, ['TICK0001', 'TICK0002', 'TICK0003']);
    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();

    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();

    await expect.poll(() => new URL(page.url()).search).toBe('');

    await page.getByRole('combobox', { name: 'Compare instruments', exact: true }).press('Escape');

    await expect(choice.getByRole('radio', { name: 'Price', exact: true })).toBeChecked();
    expect(new URL(page.url()).search).toBe('');
  });

  test('counts unknown selections for the default view without inventing their data', async ({
    page,
  }, testInfo) => {
    await page.goto('/?tickers=TICK0001,UNKNOWN,TICK0002');

    await ready(page, ['TICK0001', 'TICK0002']);

    const choice = page.getByRole('radiogroup', { name: 'Chart view' });

    await expect(choice.getByRole('radio', { name: 'Performance', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Remove UNKNOWN', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('group', { name: 'UNKNOWN resources', exact: true })
        .getByText('Not in this dataset', { exact: true }),
    ).toBeVisible();

    const chart = page.getByRole('img', { name: 'Rebased price change', exact: true });

    // e2e-locator: An unavailable selected identity must not gain a fabricated zero-valued line.
    await expect(chart.locator('[data-series-id="UNKNOWN"] path')).toHaveCount(0);

    await expectIdentity(
      page,
      'Rebased price change',
      'TICK0002',
      'tertiary',
      'rgb(180, 83, 9)',
      '2px, 4px',
    );
    await page.screenshot({
      path: testInfo.outputPath('unknown-peer-performance.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Remove UNKNOWN', exact: true }).click();
    await expectIdentity(
      page,
      'Rebased price change',
      'TICK0002',
      'tertiary',
      'rgb(180, 83, 9)',
      '2px, 4px',
    );
  });
});

const comparisonTickers = ['TICK0001', 'TICK0002', 'TICK0003'] as const;

async function loadComparisonResponses(page: Page) {
  // Observe the application's existing Query requests; the oracle adds no HTTP calls.
  const pending = comparisonTickers.map(async (ticker) => {
    const [prices, statistics] = await Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === `/api/prices/${ticker}`,
      ),
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === `/api/prices/${ticker}/stats`,
      ),
    ]);

    expect(prices.status()).toBe(200);
    expect(statistics.status()).toBe(200);
    return {
      ticker,
      prices: priceSeriesSchema.parse(await prices.json()),
      statistics: priceStatsSchema.parse(await statistics.json()),
    };
  });

  await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');

  const responses = await Promise.all(pending);

  await ready(page, comparisonTickers);
  return responses;
}

async function expectComparisonDate(page: Page, date: string) {
  const [year, month, day] = date.split('-').map(Number);

  await expect(page.getByRole('spinbutton', { name: /^month,/i })).toHaveAttribute(
    'aria-valuenow',
    String(month),
  );
  await expect(page.getByRole('spinbutton', { name: /^day,/i })).toHaveAttribute(
    'aria-valuenow',
    String(day),
  );
  await expect(page.getByRole('spinbutton', { name: /^year,/i })).toHaveAttribute(
    'aria-valuenow',
    String(year),
  );
}

async function chooseComparisonDate(page: Page, date: string, touch = false) {
  const control = page.getByRole('button', { name: 'Choose comparison date', exact: true });
  if (touch) await control.tap();
  else await control.press('Enter');

  const calendar = page.getByRole('dialog');
  const target = new Date(`${date}T00:00:00.000Z`);
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(target);

  // The source series spans three months; navigate the real calendar month controls.
  for (let step = 0; step < 3; step += 1) {
    const displayedMonth = await calendar.getByRole('heading').textContent();
    if (displayedMonth === monthLabel) break;
    if (!displayedMonth) throw new Error('Expected the visible calendar month.');

    const direction =
      Date.parse(`1 ${displayedMonth} UTC`) > target.getTime() ? 'Previous' : 'Next';
    const navigation = calendar.getByRole('button', { name: `${direction} month`, exact: true });
    if (touch) await navigation.tap();
    else await navigation.press('Enter');
  }

  await expect(calendar.getByRole('heading')).toHaveText(monthLabel);

  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(target);
  const cell = calendar.getByRole('button', { name: new RegExp(`^${label}(?: selected)?(?:,|$)`) });
  if (touch) await cell.tap();
  else await cell.press('Enter');

  await expect(calendar).toHaveCount(0);
  await expectComparisonDate(page, date);
  await expect(control).toBeFocused();
}

async function chartPosition(page: Page, fraction: number) {
  const chart = page.getByRole('img', { name: 'Rebased price change', exact: true });
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  const viewBox = (await chart.getAttribute('viewBox'))?.split(' ').map(Number);
  // e2e-locator: The real SVG plot rectangle gives a viewport-independent recorded-date target.
  const plot = chart.locator('clipPath rect');
  const [left, top, width, height] = await Promise.all(
    ['x', 'y', 'width', 'height'].map(async (name) => Number(await plot.getAttribute(name))),
  );
  if (
    !box ||
    !viewBox?.[2] ||
    !viewBox[3] ||
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  )
    throw new Error('Expected measured plot geometry.');
  return {
    chart,
    position: {
      x: ((left + width * fraction) * box.width) / viewBox[2],
      y: ((top + height / 2) * box.height) / viewBox[3],
    },
  };
}

async function expectFirstDate(
  page: Page,
  responses: Awaited<ReturnType<typeof loadComparisonResponses>>,
) {
  for (const { ticker, prices } of responses) {
    const first = prices[0];
    if (!first) throw new Error('Expected an initial observation.');
    await expect(await matrixCell(page, ticker, 'Closing price')).toHaveText(
      priceLabel.format(first.price),
    );
    await expect(await matrixCell(page, ticker, 'Total return')).toHaveText('0.00%');
    await expect(await matrixCell(page, ticker, 'Daily volatility')).toHaveText(
      'Not enough observations',
    );
    await expect(await matrixCell(page, ticker, 'Max drawdown')).toHaveText('0.00%');
  }
}

async function expectFinalParity(
  page: Page,
  responses: Awaited<ReturnType<typeof loadComparisonResponses>>,
) {
  for (const { ticker, prices, statistics } of responses) {
    const final = prices.at(-1);
    if (!final) throw new Error('Expected a final observation.');
    const pinned = getHistoricalComparison(prices, Date.parse(`${final.date}T00:00:00.000Z`));

    // Exact unrounded JSON equality with the real C# response, not a display tolerance.
    expect(pinned.statistics).toEqual(statistics);
    expect(pinned.observationCount).toBe(prices.length);
    expect(pinned.closingPrice).toBe(final.price);
    await expect(await matrixCell(page, ticker, 'Closing price')).toHaveText(
      priceLabel.format(final.price),
    );
    await expect(await matrixCell(page, ticker, 'Total return')).toHaveText(
      formatSignedPercentage(statistics.totalReturnPercent),
    );
    await expect(await matrixCell(page, ticker, 'Daily volatility')).toHaveText(
      formatPercentage(statistics.dailyVolatilityPercent),
    );
    await expect(await matrixCell(page, ticker, 'Max drawdown')).toHaveText(
      formatPercentage(statistics.maxDrawdownPercent),
    );
  }
}

test.describe('Pin date-aware comparison statistics', () => {
  test.use({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Los_Angeles' });

  test('navigates actual dates with the keyboard and matches the backend exactly at the final date', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const responses = await loadComparisonResponses(page);
    const loaded = [...requests.paths];

    expect(loaded).toHaveLength(7);

    const matrix = page.getByRole('table', { name: 'Comparison', exact: true });
    const latestCells = await matrix.getByRole('cell').allTextContents();
    const control = page.getByRole('button', { name: 'Choose comparison date', exact: true });

    await expect(matrix).toHaveAccessibleDescription(/full supplied window/);
    await expect(page.getByRole('button', { name: 'Back to latest', exact: true })).toHaveCount(0);

    const first = responses[0]?.prices[0];
    const second = responses[0]?.prices[1];
    const penultimate = responses[0]?.prices.at(-2);
    const final = responses[0]?.prices.at(-1);
    if (!first || !second || !penultimate || !final)
      throw new Error('Expected real historical date endpoints.');

    await chooseComparisonDate(page, first.date);
    await expectFirstDate(page, responses);

    await expect(matrix).toHaveAccessibleDescription(/Pinned Jun 23, 2026.*inclusive/);
    await expect(page.getByRole('button', { name: 'Previous date', exact: true })).toBeDisabled();

    await page.screenshot({ path: testInfo.outputPath('date-desktop-first.png'), fullPage: true });
    await page.getByRole('button', { name: 'Next date', exact: true }).press('Enter');

    await expectComparisonDate(page, second.date);
    for (const ticker of comparisonTickers) {
      await expect(await matrixCell(page, ticker, 'Daily volatility')).toHaveText(
        'Not enough observations',
      );
    }

    await page.getByRole('button', { name: 'Previous date', exact: true }).press('Enter');
    await expectFirstDate(page, responses);

    await expect(control).toBeFocused();

    await chooseComparisonDate(page, penultimate.date);
    await page.getByRole('button', { name: 'Next date', exact: true }).press('Enter');

    await expectComparisonDate(page, final.date);
    await expect(control).toBeFocused();

    await expectFinalParity(page, responses);

    await expect(page.getByRole('button', { name: 'Next date', exact: true })).toBeDisabled();

    await page.screenshot({ path: testInfo.outputPath('date-desktop-final.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back to latest', exact: true }).press('Enter');

    await expect(matrix).toHaveAccessibleDescription(/full supplied window/);
    await expect(matrix.getByRole('cell')).toHaveText(latestCells);
    await expect(control).toBeFocused();
    expect(requests.paths).toEqual(loaded);

    requests.stop();
  });

  test('uses segmented UTC entry and native calendar keyboard navigation without changing a pin on Escape', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const responses = await loadComparisonResponses(page);
    const loaded = [...requests.paths];
    const control = page.getByRole('button', { name: 'Choose comparison date', exact: true });
    const matrix = page.getByRole('table', { name: 'Comparison', exact: true });

    await page.getByRole('spinbutton', { name: /^month,/i }).fill('6');
    await page.getByRole('spinbutton', { name: /^day,/i }).fill('23');
    await page.getByRole('spinbutton', { name: /^year,/i }).fill('2026');
    await control.focus();
    await expectComparisonDate(page, '2026-06-23');
    await expectFirstDate(page, responses);

    const firstCells = await matrix.getByRole('cell').allTextContents();

    await control.press('Enter');

    const calendar = page.getByRole('dialog');
    const first = calendar.getByRole('button', {
      name: /^Tuesday, June 23, 2026(?: selected)?(?:,|$)/,
    });
    const second = calendar.getByRole('button', {
      name: /^Wednesday, June 24, 2026(?: selected)?(?:,|$)/,
    });

    await expect(first).toBeFocused();
    await first.press('ArrowRight');

    await expect(second).toBeFocused();
    await expect(matrix.getByRole('cell')).toHaveText(firstCells);

    await page.screenshot({
      path: testInfo.outputPath('calendar-desktop-open.png'),
      fullPage: true,
    });
    await second.press('Escape');

    await expect(calendar).toHaveCount(0);
    await expect(control).toBeFocused();
    await expect(matrix.getByRole('cell')).toHaveText(firstCells);

    await control.press('Enter');
    await first.press('ArrowRight');
    await second.press('Enter');

    await expectComparisonDate(page, '2026-06-24');
    await expect(matrix).toHaveAccessibleDescription(/Pinned Jun 24, 2026/);

    await page.getByRole('spinbutton', { name: /^month,/i }).press('Backspace');

    await expect(matrix).toHaveAccessibleDescription(/Pinned Jun 24, 2026/);

    const day = page.getByRole('spinbutton', { name: /^day,/i });
    await day.press('Backspace');
    await day.press('Backspace');

    const year = page.getByRole('spinbutton', { name: /^year,/i });
    for (let digit = 0; digit < 4; digit += 1) await year.press('Backspace');

    await expect(matrix).toHaveAccessibleDescription(/full supplied window/);
    await expect(page.getByRole('button', { name: 'Back to latest', exact: true })).toHaveCount(0);
    expect(requests.paths).toEqual(loaded);

    requests.stop();
  });

  test('previews on hover but commits clicks and native keyboard dates without refetching', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const responses = await loadComparisonResponses(page);
    const loaded = [...requests.paths];
    const matrix = page.getByRole('table', { name: 'Comparison', exact: true });
    const latestCells = await matrix.getByRole('cell').allTextContents();
    const control = page.getByRole('button', { name: 'Choose comparison date', exact: true });
    const details = page.getByRole('region', {
      name: 'Details for Rebased price change',
      exact: true,
    });
    const firstTarget = await chartPosition(page, 0);
    await firstTarget.chart.hover({ position: firstTarget.position });

    await expect(details.getByRole('heading', { level: 3 })).toHaveText('Tue, Jun 23, 2026');
    await expect(matrix).toHaveAccessibleDescription(/full supplied window/);
    await expect(matrix.getByRole('cell')).toHaveText(latestCells);

    await firstTarget.chart.click({ position: firstTarget.position });
    await expectFirstDate(page, responses);
    const pinnedCells = await matrix.getByRole('cell').allTextContents();

    const finalTarget = await chartPosition(page, 1);
    await finalTarget.chart.hover({ position: finalTarget.position });

    await expect(details.getByRole('heading', { level: 3 })).toHaveText('Mon, Aug 3, 2026');
    await expectComparisonDate(page, '2026-06-23');
    await expect(matrix.getByRole('cell')).toHaveText(pinnedCells);

    await page.screenshot({
      path: testInfo.outputPath('date-desktop-hover.png'),
      animations: 'disabled',
    });

    await expect(details.getByRole('heading', { level: 3 })).toHaveText('Mon, Aug 3, 2026');

    await control.hover();

    await expect(details.getByRole('heading', { level: 3 })).toHaveText('Tue, Jun 23, 2026');

    const inspector = page.getByRole('slider', {
      name: 'Inspect Rebased price change',
      exact: true,
    });

    await inspector.press('End');
    await expectFinalParity(page, responses);
    await inspector.press('Home');
    await expectFirstDate(page, responses);

    await expect(inspector).toBeFocused();

    await inspector.press('ArrowRight');

    await expectComparisonDate(page, '2026-06-24');

    const keyboardCells = await matrix.getByRole('cell').allTextContents();
    await page
      .getByRole('radiogroup', { name: 'Chart view' })
      .getByText('Price', { exact: true })
      .click();

    await expectComparisonDate(page, '2026-06-24');
    await expect(matrix.getByRole('cell')).toHaveText(keyboardCells);
    await expect(
      page.getByRole('slider', { name: 'Inspect Historical closing prices', exact: true }),
    ).toHaveValue('1');

    await page.getByRole('button', { name: 'Back to latest', exact: true }).click();

    await expect(matrix.getByRole('cell')).toHaveText(latestCells);
    expect(requests.paths).toEqual(loaded);

    requests.stop();
  });
});

test.describe('Pin comparison dates on touch screens', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('pins a chart tap and makes every ticker reachable at first and final dates', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const responses = await loadComparisonResponses(page);
    const loaded = [...requests.paths];
    const firstTarget = await chartPosition(page, 0);
    await firstTarget.chart.tap({ position: firstTarget.position });
    await expectFirstDate(page, responses);
    await page.screenshot({ path: testInfo.outputPath('date-mobile-first.png'), fullPage: true });
    const final = responses[0]?.prices.at(-1);
    if (!final) throw new Error('Expected a final recorded date.');
    await chooseComparisonDate(page, final.date, true);
    await expectFinalParity(page, responses);

    const dateControl = page.getByRole('button', { name: 'Choose comparison date', exact: true });
    await dateControl.tap();

    const calendar = page.getByRole('dialog');
    await expect(calendar).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath('calendar-mobile-open.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');

    const area = page.getByRole('region', { name: 'Comparison table scroll area', exact: true });
    for (const ticker of comparisonTickers) {
      const cell = await matrixCell(page, ticker, 'Closing price');
      await cell.scrollIntoViewIfNeeded();

      await expect(cell).toBeInViewport();
      await expect(
        area.getByRole('rowheader', { name: 'Closing price', exact: true }),
      ).toBeInViewport();
    }
    for (const name of ['Previous date', 'Next date', 'Back to latest']) {
      expect(
        (await page.getByRole('button', { name, exact: true }).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44);
    }
    // e2e-locator: The native root dimensions prove the date controls do not overflow a mobile viewport.
    expect(
      await page
        .locator('html')
        .evaluate(
          (element: { scrollWidth: number; clientWidth: number }) =>
            element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);

    await page.screenshot({ path: testInfo.outputPath('date-mobile-final.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back to latest', exact: true }).tap();

    await ready(page, comparisonTickers);
    await expect(
      page.getByRole('table', { name: 'Comparison', exact: true }),
    ).toHaveAccessibleDescription(/full supplied window/);
    expect(requests.paths).toEqual(loaded);

    requests.stop();
  });

  test('fits the calendar and segmented input at 320 pixels', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const responses = await loadComparisonResponses(page);
    const first = responses[0]?.prices[0];
    if (!first) throw new Error('Expected a first recorded date.');

    await chooseComparisonDate(page, first.date, true);
    await expectFirstDate(page, responses);
    await page.getByRole('button', { name: 'Choose comparison date', exact: true }).tap();

    const calendar = page.getByRole('dialog');
    const bounds = await calendar.boundingBox();
    if (!bounds) throw new Error('Expected visible calendar bounds.');

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await expect(
      calendar.getByRole('button', { name: /^Tuesday, June 23, 2026(?: selected)?(?:,|$)/ }),
    ).toBeInViewport();

    // e2e-locator: Measure the document's actual scroll width after opening the calendar.
    expect(
      await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath('calendar-small-mobile-open.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
  });
});
