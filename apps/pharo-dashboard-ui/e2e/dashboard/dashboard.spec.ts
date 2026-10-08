import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

const dateLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const priceLabel = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

async function expectContainedDocument(page: Page) {
  // e2e-locator: document dimensions distinguish local table scrolling from page overflow.
  expect(
    await page
      .locator('html')
      .evaluate(
        (element: { scrollWidth: number; clientWidth: number }) =>
          element.scrollWidth <= element.clientWidth,
      ),
  ).toBe(true);
}

// Every case uses the compiled UI, owned ASP.NET host and supplied CSV. No API mock.
test.describe('Browse and inspect historical instruments', () => {
  test('reaches every instrument through paging and keeps search separate from selection', async ({
    page,
  }) => {
    const requests: string[] = [];
    const record = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) requests.push(path);
    };
    page.on('request', record);
    try {
      await page.goto('/');
      const results = page.getByRole('list', { name: 'Instrument results', exact: true });
      await expect(results.getByRole('button')).toHaveCount(10);
      await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
      const reached = new Set<string>();
      for (let currentPage = 1; currentPage <= 20; currentPage += 1) {
        await expect(
          page.getByText(
            `Showing ${(currentPage - 1) * 10 + 1}–${currentPage * 10} of 200 instruments. Page ${currentPage} of 20.`,
            { exact: true },
          ),
        ).toBeVisible();
        const labels = await results
          .getByRole('button')
          .evaluateAll((elements: { getAttribute(name: string): string | null }[]) =>
            elements.map((element) => element.getAttribute('aria-label')),
          );
        for (const label of labels) {
          expect(label).toMatch(/^Add TICK\d{4}$/);
          if (label) reached.add(label.slice(4));
        }
        if (currentPage < 20) {
          await page.getByRole('button', { name: 'Next page' }).press('Enter');
          await expect(
            results.getByRole('button', {
              name: `Add TICK${String(currentPage * 10 + 1).padStart(4, '0')}`,
              exact: true,
            }),
          ).toBeFocused();
        }
      }
      expect(reached.size).toBe(200);
      expect(reached.has('TICK0001')).toBe(true);
      expect(reached.has('TICK0200')).toBe(true);
      await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
      expect(requests).toEqual(['/api/instruments']);

      const search = page.getByRole('textbox', { name: 'Search instruments', exact: true });
      await search.fill('  tiCk0001  ');
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('  tiCk0001  ');
      await expect(results.getByRole('button')).toHaveCount(1);
      expect(new URL(page.url()).search).toBe('');
      expect(requests).toEqual(['/api/instruments']);
      await search.press('Tab');
      await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused();
      await page.keyboard.press('Tab');
      const add = results.getByRole('button', { name: 'Add TICK0001', exact: true });
      await expect(add).toBeFocused();
      await expect(add).toHaveCSS('outline', 'rgb(0, 111, 166) solid 3px');
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('region', { name: 'TICK0001 statistics', exact: true }),
      ).toContainText('-9.17%');
      await expect(
        page.getByRole('img', { name: 'Historical closing prices', exact: true }),
      ).toBeVisible();
      const fetched = [...requests];

      await search.fill('no match');
      await expect(
        page.getByText('No instruments match your search.', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove selected TICK0001' })).toBeVisible();
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('');
      expect(new URL(page.url()).searchParams.get('tickers')).toBe('TICK0001');
      expect(requests).toEqual(fetched);
      await search.fill('0001');
      await page.getByRole('button', { name: 'Clear selection' }).click();
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('0001');
      await expect(page.getByRole('article')).toHaveCount(0);
      expect(new URL(page.url()).search).toBe('');
      expect(requests).toEqual(fetched);
    } finally {
      page.off('request', record);
    }
  });

  test('shows the full real price series, independent statistics and UTC inspection at desktop and intermediate widths', async ({
    page,
  }, testInfo) => {
    // Read the supplied artifact directly, independently of the production CSV loader/adapter.
    const csv = await readFile(
      new URL('../../../pharo-dashboard-api/Data/market_data.csv', import.meta.url),
      'utf8',
    );
    const expectedPrices = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .flatMap((line) => {
        const [date, ticker, price] = line.split(',');
        return ticker === 'TICK0001' && date && price ? [{ date, price: Number(price) }] : [];
      });
    expect(expectedPrices).toHaveLength(30);
    const priceResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/prices/TICK0001',
    );
    const statsResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/prices/TICK0001/stats',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/?tickers=TICK0001');
    expect(await (await priceResponse).json()).toEqual(expectedPrices);
    // Independent expected values are recorded in the public API test oracle fixture.
    expect(await (await statsResponse).json()).toEqual({
      totalReturnPercent: expect.closeTo(-9.167804980561112, 10),
      dailyVolatilityPercent: expect.closeTo(1.523165384579988, 10),
      maxDrawdownPercent: expect.closeTo(13.3849387399395, 10),
    });
    const statistics = page.getByRole('region', { name: 'TICK0001 statistics', exact: true });
    for (const value of ['-9.17%', '1.52%', '13.38%']) {
      await expect(statistics.getByRole('definition').filter({ hasText: value })).toBeVisible();
    }
    for (const explanation of [
      'First to last observation',
      'Sample deviation of daily returns',
      'Largest peak-to-trough decline',
    ]) {
      await expect(statistics.getByText(explanation, { exact: true })).toBeVisible();
    }
    const prices = page.getByRole('region', { name: 'TICK0001 prices', exact: true });
    for (const value of ['30', 'Jun 23, 2026', 'Aug 3, 2026', '172.89']) {
      await expect(prices.getByText(value, { exact: true })).toBeVisible();
    }
    const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
    await expect(chart).toBeVisible();
    expect((await chart.boundingBox())?.height).toBe(320);
    // e2e-locator: the SVG series path proves actual line geometry for the selected identity.
    const line = chart.locator('[data-series-id="TICK0001"] path');
    await expect(line).toHaveAttribute('d', /^M.*L/);
    await expect(line).toHaveCSS('stroke', 'rgb(37, 99, 235)');
    const inspector = page.getByRole('slider', { name: 'Inspect Historical closing prices' });
    const details = page.getByRole('region', { name: 'Details for Historical closing prices' });
    await inspector.press('Home');
    await expect(details.getByText('Tue, Jun 23, 2026', { exact: true })).toBeVisible();
    await expect(details.getByText('190.34', { exact: true })).toBeVisible();
    await inspector.press('End');
    await expect(inspector).toBeFocused();
    await expect(inspector).toHaveCSS('outline', 'rgb(0, 111, 166) solid 3px');
    await expect(details.getByText('Mon, Aug 3, 2026', { exact: true })).toBeVisible();
    await expect(details.getByText('172.89', { exact: true })).toBeVisible();

    const selector = page.getByRole('region', { name: 'Available instruments', exact: true });
    const analysis = page.getByRole('region', { name: 'Selected instruments', exact: true });
    const selectorBox = await selector.boundingBox();
    const analysisBox = await analysis.boundingBox();
    if (!selectorBox || !analysisBox) throw new Error('Expected measured dashboard panels');
    expect(analysisBox.x).toBeGreaterThanOrEqual(selectorBox.x + selectorBox.width);
    await expectContainedDocument(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
    await page
      .getByRole('button', { name: 'Show data table for Historical closing prices' })
      .click();
    const table = page.getByRole('table', { name: 'Data for Historical closing prices' });
    await expect(table.getByRole('columnheader')).toHaveText(['Date (UTC)', 'TICK0001']);
    await expect(table.getByRole('rowheader')).toHaveText(
      expectedPrices.map((point) => dateLabel.format(new Date(`${point.date}T00:00:00.000Z`))),
    );
    await expect(table.getByRole('cell')).toHaveText(
      expectedPrices.map((point) => priceLabel.format(point.price)),
    );

    await page.setViewportSize({ width: 768, height: 1024 });
    const stackedSelector = await selector.boundingBox();
    const stackedAnalysis = await analysis.boundingBox();
    if (!stackedSelector || !stackedAnalysis) throw new Error('Expected stacked dashboard panels');
    expect(stackedAnalysis.y).toBeGreaterThanOrEqual(stackedSelector.y + stackedSelector.height);
    expect((await chart.boundingBox())?.height).toBe(320);
    await expectContainedDocument(page);
    await page.screenshot({
      path: testInfo.outputPath('dashboard-intermediate.png'),
      fullPage: true,
    });
  });
});

test.describe('Inspect prices on a narrow touch screen', () => {
  test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

  test('wraps a long unknown ticker without overflowing the narrow page', async ({ page }) => {
    const ticker = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW';
    await page.goto('/?tickers=' + ticker);
    await expect(
      page.getByRole('region', { name: `${ticker} prices`, exact: true }).getByRole('alert'),
    ).toHaveText('Instrument not found.');
    await expect(
      page.getByRole('region', { name: `${ticker} statistics`, exact: true }).getByRole('alert'),
    ).toHaveText('Instrument not found.');
    await expectContainedDocument(page);
  });

  test('keeps touch targets, chart inspection and the full table usable without page overflow', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const search = page.getByRole('textbox', { name: 'Search instruments', exact: true });
    await search.fill('0001');
    const add = page.getByRole('button', { name: 'Add TICK0001', exact: true });
    expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await add.tap();
    const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error('Expected a measured touch chart');
    expect(box.height).toBe(320);
    expect(box.width).toBeGreaterThan(200);
    await chart.tap({ position: { x: box.width - 20, y: 160 } });
    const details = page.getByRole('region', { name: 'Details for Historical closing prices' });
    await expect(details.getByText('Mon, Aug 3, 2026', { exact: true })).toBeVisible();
    await expect(details.getByText('172.89', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show data table for Historical closing prices' }).tap();
    const tableRegion = page.getByRole('region', {
      name: 'Data table for Historical closing prices',
    });
    await expect(tableRegion.getByRole('rowheader')).toHaveCount(30);
    const scroll = await tableRegion.evaluate(
      (element: { scrollWidth: number; clientWidth: number }) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
      }),
    );
    expect(scroll.content).toBeGreaterThan(scroll.width);
    await tableRegion.press('ArrowRight');
    await expect(tableRegion).toBeFocused();
    await expect
      .poll(() => tableRegion.evaluate((element: { scrollLeft: number }) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expectContainedDocument(page);
    await page.screenshot({
      path: testInfo.outputPath('dashboard-narrow-touch.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Remove selected TICK0001', exact: true }).tap();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('0001');
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
  });
});
