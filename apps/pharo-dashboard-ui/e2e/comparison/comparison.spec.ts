import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';
import { priceSeriesSchema, priceStatsSchema } from '../../src/api/prices/schema';
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
  const table = page.getByRole('table', { name: 'Full-period comparison', exact: true });

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
        page
          .getByRole('table', { name: 'Full-period comparison', exact: true })
          .getByRole('columnheader'),
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
        page
          .getByRole('table', { name: 'Full-period comparison', exact: true })
          .getByRole('columnheader'),
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
          .getByRole('table', { name: 'Full-period comparison', exact: true })
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
      await expect(
        page.getByRole('heading', { name: 'Full-period comparison', exact: true }),
      ).toBeFocused();
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
      await expect(
        page.getByRole('heading', { name: 'Full-period comparison', exact: true }),
      ).toBeFocused();
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
    .getByRole('table', { name: 'Full-period comparison', exact: true })
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

    const matrix = page.getByRole('table', { name: 'Full-period comparison', exact: true });
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

    await expect(matrix.getByRole('cell')).toHaveText(fullWindowValues);

    await choice.getByText('Performance', { exact: true }).click();

    await expect(
      page.getByRole('slider', { name: 'Inspect Rebased price change', exact: true }),
    ).toHaveValue('1');
    expect(await instance.evaluate((element) => element.isConnected)).toBe(true);
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

async function expectLatestComparison(
  page: Page,
  responses: Awaited<ReturnType<typeof loadComparisonResponses>>,
) {
  for (const { ticker, prices, statistics } of responses) {
    const latest = prices.at(-1);
    if (!latest) throw new Error('Expected a latest observation.');

    expect(prices).toHaveLength(30);
    await expect(await matrixCell(page, ticker, 'Latest close')).toHaveText(
      priceLabel.format(latest.price),
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

test.describe('Chart inspection independent of latest comparison', () => {
  test.use({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Los_Angeles' });

  test('keeps hover, click and keyboard inspection independent of latest comparison', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    try {
      const responses = await loadComparisonResponses(page);
      const loaded = [...requests.paths];

      expect(loaded).toHaveLength(7);
      await expectLatestComparison(page, responses);

      const matrix = page.getByRole('table', { name: 'Full-period comparison', exact: true });
      const latestCells = await matrix.getByRole('cell').allTextContents();
      const details = page.getByRole('region', {
        name: 'Details for Rebased price change',
        exact: true,
      });
      const inspector = page.getByRole('slider', {
        name: 'Inspect Rebased price change',
        exact: true,
      });

      await expect(inspector).toHaveAttribute('max', '29');
      await expect(matrix).toHaveAccessibleDescription(/complete supplied window/);

      const firstTarget = await chartPosition(page, 0);
      await firstTarget.chart.hover({ position: firstTarget.position });

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Tue, Jun 23, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);

      const finalTarget = await chartPosition(page, 1);
      await finalTarget.chart.click({ position: finalTarget.position });

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Mon, Aug 3, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);

      await inspector.press('Home');

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Tue, Jun 23, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);

      await inspector.press('ArrowRight');

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Wed, Jun 24, 2026');
      await expect(inspector).toBeFocused();
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);
      await page.screenshot({
        path: testInfo.outputPath('comparison-desktop-inspection.png'),
        fullPage: true,
      });

      await inspector.press('End');

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Mon, Aug 3, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);

      await page.getByRole('button', { name: 'View data', exact: true }).click();

      await expect(
        page
          .getByRole('table', { name: 'Recorded closing prices', exact: true })
          .getByRole('rowheader'),
      ).toHaveCount(30);
      expect(requests.paths).toEqual(loaded);
    } finally {
      requests.stop();
    }
  });
});

test.describe('Touch chart inspection independent of latest comparison', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('keeps touch inspection independent of latest comparison and every ticker reachable', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    try {
      const responses = await loadComparisonResponses(page);
      const loaded = [...requests.paths];

      expect(loaded).toHaveLength(7);
      await expectLatestComparison(page, responses);

      const matrix = page.getByRole('table', { name: 'Full-period comparison', exact: true });
      const latestCells = await matrix.getByRole('cell').allTextContents();
      const details = page.getByRole('region', {
        name: 'Details for Rebased price change',
        exact: true,
      });
      const firstTarget = await chartPosition(page, 0);
      await firstTarget.chart.tap({ position: firstTarget.position });

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Tue, Jun 23, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);
      await page.screenshot({
        path: testInfo.outputPath('comparison-mobile-inspection.png'),
        fullPage: true,
      });

      const finalTarget = await chartPosition(page, 1);
      await finalTarget.chart.tap({ position: finalTarget.position });

      await expect(details.getByRole('heading', { level: 3 })).toHaveText('Mon, Aug 3, 2026');
      await expect(matrix.getByRole('cell')).toHaveText(latestCells);
      await expect(matrix).toHaveAccessibleDescription(/complete supplied window/);

      const area = page.getByRole('region', { name: 'Comparison table scroll area', exact: true });
      for (const ticker of comparisonTickers) {
        const cell = await matrixCell(page, ticker, 'Latest close');
        await cell.scrollIntoViewIfNeeded();

        await expect(cell).toBeInViewport();
        await expect(
          area.getByRole('rowheader', { name: 'Latest close', exact: true }),
        ).toBeInViewport();
      }
      expect(requests.paths).toEqual(loaded);
    } finally {
      requests.stop();
    }
  });
});

async function expectAlignedInspection(page: Page, action: () => Promise<unknown>) {
  const chart = page.getByRole('img', {
    name: /^(Historical closing prices|Rebased price change)$/,
  });
  // e2e-locator: Compare actual screen-space marker centers with each recorded SVG path point.
  // Sampling rendered frames also catches transitions that temporarily detach a dot from its line.
  const frames = chart.evaluate(async (svg) => {
    interface ScreenTransform {
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
    }
    const browser: {
      requestAnimationFrame(callback: () => void): number;
    } | null = svg.ownerDocument.defaultView;
    if (!browser) throw new Error('Missing inspection window.');
    const samples: Array<{ ticker: string; index: number; distance: number }> = [];
    for (let frame = 0; frame < 24; frame += 1) {
      await new Promise<void>((resolve) => browser.requestAnimationFrame(() => resolve()));
      const slider: {
        value: string;
      } | null = svg.closest('figure')?.querySelector('input[type="range"]');
      if (!slider) throw new Error('Missing inspection control.');
      const index = Number(slider.value);
      for (const group of svg.querySelectorAll('[data-inspection-series-id]')) {
        const ticker = group.getAttribute('data-inspection-series-id');
        const dot = group.querySelector('circle');
        const path: {
          getAttribute(name: string): string | null;
          getScreenCTM(): ScreenTransform | null;
        } | null = svg.querySelector(`[data-series-id="${ticker}"] path`);
        if (!dot || !path) throw new Error('Missing recorded path or inspection marker.');
        const coordinates = Array.from(
          (path.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.e+]+),(-?[\d.e+]+)/g),
        );
        if (coordinates.length !== 30) throw new Error('Expected all 30 recorded coordinates.');
        const coordinate = coordinates[index];
        const pathTransform = path.getScreenCTM();
        if (!coordinate || !pathTransform || !ticker)
          throw new Error('Missing rendered coordinate transform.');
        const bounds = dot.getBoundingClientRect();
        const actual = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const x = Number(coordinate[1]);
        const y = Number(coordinate[2]);
        const expected = {
          x: pathTransform.a * x + pathTransform.c * y + pathTransform.e,
          y: pathTransform.b * x + pathTransform.d * y + pathTransform.f,
        };
        samples.push({
          ticker,
          index,
          distance: Math.hypot(actual.x - expected.x, actual.y - expected.y),
        });
      }
    }
    return samples;
  });
  const [samples] = await Promise.all([frames, action()]);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter(({ distance }) => distance > 0.75)).toEqual([]);
}

test.describe('Recorded chart marker alignment', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keeps marker centers on recorded paths during changes with ${reducedMotion} motion`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion });
      const responses = await loadComparisonResponses(page);
      const inspector = page.getByRole('slider', { name: /^Inspect / });

      await expectAlignedInspection(page, () => inspector.press('Home'));
      await expectAlignedInspection(page, () => inspector.press('ArrowRight'));
      await expectAlignedInspection(page, () =>
        page.getByRole('radio', { name: 'Price', exact: true }).click(),
      );
      await expectAlignedInspection(page, () => page.setViewportSize({ width: 390, height: 844 }));
      await expectAlignedInspection(page, () =>
        page.getByRole('button', { name: 'Remove TICK0001', exact: true }).click(),
      );
      await expectAlignedInspection(page, () => chooseInstrument(page, 'TICK0001'));
      await expectAlignedInspection(page, () => inspector.press('ArrowRight'));
      await page.screenshot({
        path: testInfo.outputPath(`aligned-mobile-${reducedMotion}.png`),
        fullPage: true,
      });
      await expectAlignedInspection(page, () =>
        page.getByRole('radio', { name: 'Performance', exact: true }).click(),
      );
      await expectAlignedInspection(page, () => page.setViewportSize({ width: 1366, height: 768 }));
      await expectAlignedInspection(page, () => inspector.press('End'));
      await expectLatestComparison(page, responses);
      await page.screenshot({
        path: testInfo.outputPath(`aligned-desktop-${reducedMotion}.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'View data', exact: true }).click();
      const table = page.getByRole('table', { name: 'Recorded closing prices', exact: true });
      await expect(table.getByRole('rowheader')).toHaveCount(30);
      await expect(table.getByRole('columnheader', { name: 'Date (UTC)', exact: true })).toHaveCSS(
        'text-align',
        'start',
      );
      for (const ticker of comparisonTickers)
        await expect(table.getByRole('columnheader', { name: ticker, exact: true })).toHaveCSS(
          'text-align',
          'end',
        );
      for (const value of await table.getByRole('cell').all())
        await expect(value).toHaveCSS('text-align', 'end');
      await page.screenshot({
        path: testInfo.outputPath(`aligned-data-desktop-${reducedMotion}.png`),
      });
      await page.setViewportSize({ width: 320, height: 844 });
      for (const ticker of comparisonTickers) {
        const header = table.getByRole('columnheader', { name: ticker, exact: true });
        await header.scrollIntoViewIfNeeded();
        await expect(header).toBeInViewport();
      }
      await page.screenshot({
        path: testInfo.outputPath(`aligned-data-mobile-${reducedMotion}.png`),
      });
    });
  }
});
