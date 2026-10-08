import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

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
  test('reaches all 200 candidates in the popup and keeps ranked search entirely local', async ({
    page,
  }, testInfo) => {
    const requests: string[] = [];
    const record = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) requests.push(path);
    };
    page.on('request', record);
    try {
      await page.goto('/');
      const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
      await input.click();
      const results = page.getByRole('listbox');
      await expect(results.getByRole('option')).toHaveCount(200);
      expect(new Set(await results.getByRole('option').allTextContents()).size).toBe(200);
      await expect(page.getByRole('button', { name: /Next page|Previous page/ })).toHaveCount(0);
      const last = results.getByRole('option', { name: 'TICK0200', exact: true });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeVisible();
      const popupBox = await results.boundingBox();
      if (!popupBox) throw new Error('Expected bounded candidate popup');
      expect(popupBox.height).toBeLessThanOrEqual(300);
      expect(requests).toEqual(['/api/instruments']);
      await input.fill('  tiCk0001  ');
      await expect(input).toHaveValue('  tiCk0001  ');
      await expect(results.getByRole('option')).toHaveCount(1);
      const first = results.getByRole('option', { name: 'TICK0001', exact: true });
      await expect(input).toHaveAttribute(
        'aria-activedescendant',
        (await first.getAttribute('id')) ?? '',
      );
      expect(new URL(page.url()).search).toBe('');
      expect(requests).toEqual(['/api/instruments']);
      await page.screenshot({
        path: testInfo.outputPath('picker-keyboard-active.png'),
        fullPage: true,
      });
      await input.dispatchEvent('compositionstart');
      await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
      expect(new URL(page.url()).search).toBe('');
      await input.dispatchEvent('compositionend');
      await input.press('Enter');
      await expect(input).toHaveValue('');
      await input.press('Escape');
      await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');
      const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
      await expect(chart).toBeVisible();
      const fetched = [...requests];
      // React Aria hides background roles while the popup is open; retain this exact chart only for geometry measurements.
      const chartElement = await chart.elementHandle();
      if (!chartElement) throw new Error('Expected the existing chart element');
      const before = await chartElement.boundingBox();
      await input.fill('no match');
      await expect(
        page.getByText('No instruments match your search.', { exact: true }),
      ).toBeVisible();
      const after = await chartElement.boundingBox();
      expect(after?.y).toBe(before?.y);
      await input.press('Enter');
      await expect(input).toHaveValue('no match');
      await input.press('Escape');
      await expect(page.getByRole('button', { name: 'Remove TICK0001' })).toBeVisible();
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('');
      expect(new URL(page.url()).searchParams.get('tickers')).toBe('TICK0001');
      expect(requests).toEqual(fetched);
      await input.fill('0001');
      await input.press('Escape');
      await page.getByRole('button', { name: 'Clear selection' }).click();
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('0001');
      await input.press('Escape');
      await expect(page.getByRole('table', { name: 'Comparison', exact: true })).toHaveCount(0);
      expect(new URL(page.url()).search).toBe('');
      expect(requests).toEqual(fetched);
    } finally {
      page.off('request', record);
    }
  });

  test('keeps one compact overlay picker for empty, single and capped comparisons across widths', async ({
    page,
  }, testInfo) => {
    for (const width of [320, 390, 768, 1366, 1440]) {
      await page.setViewportSize({
        width,
        height: width === 1366 ? 768 : width === 768 ? 1024 : width < 768 ? 844 : 900,
      });
      for (const [state, route] of [
        ['empty', '/'],
        ['single', '/?tickers=TICK0001'],
        ['three', '/?tickers=TICK0001,TICK0002,TICK0003'],
      ] as const) {
        await page.goto(route);
        const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
        await expect(input).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Retry instruments' })).toHaveCount(0);
        if (state !== 'empty') {
          await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');
          if (state === 'three') {
            await expect(await matrixCell(page, 'TICK0002', 'Total return')).toHaveText('-10.49%');
            await expect(await matrixCell(page, 'TICK0003', 'Total return')).toHaveText('+10.94%');
          }
          const scroll = page.getByRole('region', {
            name: 'Comparison table scroll area',
            exact: true,
          });
          const dimensions = await scroll.evaluate((element) => ({
            width: element.clientWidth,
            content: element.scrollWidth,
          }));
          if (width >= 1366) {
            expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
            const chartBox = await page
              .getByRole('region', {
                name: state === 'three' ? 'Rebased price change' : 'Historical closing prices',
                exact: true,
              })
              .boundingBox();
            const matrixBox = await page
              .getByRole('region', { name: 'Comparison', exact: true })
              .boundingBox();
            if (!chartBox || !matrixBox)
              throw new Error('Expected both measured analytical surfaces.');
            expect(matrixBox.x).toBeGreaterThan(chartBox.x + chartBox.width);
            expect(matrixBox.y).toBe(chartBox.y);
          }
          if (state === 'three') {
            // e2e-locator: The document height measures the primary workspace, without an observation dialog.
            const height = await page.locator('html').evaluate((element) => element.scrollHeight);
            if (width === 390) expect(height).toBeLessThanOrEqual(2 * 844);
            if (width >= 1366 || width === 390)
              await testInfo.attach(`workspace-dimensions-${width}`, {
                body: JSON.stringify({
                  width,
                  viewportHeight: page.viewportSize()?.height,
                  documentHeight: height,
                  matrixContentWidth: dimensions.content,
                  matrixViewportWidth: dimensions.width,
                }),
                contentType: 'application/json',
              });
          }
          if (width === 320 && state === 'three') {
            expect(dimensions.content).toBeGreaterThan(dimensions.width);
            await scroll.press('ArrowRight');
            await expect
              .poll(() => scroll.evaluate((element) => element.scrollLeft))
              .toBeGreaterThan(0);
          }
        }
        await expectContainedDocument(page);
        await page.screenshot({
          path: testInfo.outputPath(`toolbar-${width}-${state}.png`),
          fullPage: true,
        });
        if (state === 'three' || state === 'empty') {
          const analysis = page.getByRole('region', { name: 'Selected instruments', exact: true });
          // Compare document positions: focusing the picker may legitimately scroll it into view.
          const before = await analysis.evaluate(
            (element) =>
              element.getBoundingClientRect().top +
              (element.ownerDocument.defaultView?.scrollY ?? 0),
          );
          await input.click();
          if ((await input.getAttribute('aria-expanded')) !== 'true')
            await input.press('ArrowDown');
          const choices = page.getByRole('listbox');
          await expect(choices.getByRole('option')).toHaveCount(200);
          const popupBox = await choices.boundingBox();
          if (!popupBox) throw new Error('Expected measured candidate overlay');
          expect(popupBox.x).toBeGreaterThanOrEqual(0);
          expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width);
          expect(popupBox.height).toBeLessThanOrEqual(300);
          if (state === 'three')
            await expect(
              choices.getByRole('option', { name: 'TICK0004', exact: true }),
            ).toHaveAttribute('aria-disabled', 'true');
          await page.screenshot({
            path: testInfo.outputPath(`toolbar-${width}-${state}-open.png`),
            fullPage: true,
          });
          await input.press('Escape');
          expect(
            await analysis.evaluate(
              (element) =>
                element.getBoundingClientRect().top +
                (element.ownerDocument.defaultView?.scrollY ?? 0),
            ),
          ).toBe(before);
        }
      }
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
    for (const [metric, value] of [
      ['Latest close', '172.89'],
      ['Total return', '-9.17%'],
      ['Daily volatility', '1.52%'],
      ['Max drawdown', '13.38%'],
    ] as const)
      await expect(await matrixCell(page, 'TICK0001', metric)).toHaveText(value);
    const matrix = page.getByRole('table', { name: 'Comparison', exact: true });
    await expect(matrix).toHaveAccessibleDescription(
      'Metrics cover each instrument’s full supplied window.',
    );
    const explanation = page.getByText('About these metrics', { exact: true });
    await explanation.click();
    const matrixRegion = page.getByRole('region', { name: 'Comparison', exact: true });
    for (const description of [
      /Total return: first to last observation/,
      /Daily volatility: sample deviation of daily returns/,
      /Max drawdown: largest peak-to-trough decline/,
    ])
      await expect(matrixRegion.getByText(description)).toBeVisible();
    await explanation.click();
    await expect(page.getByText('30 observations', { exact: true })).toBeVisible();
    await expect(page.getByText('Jun 23 – Aug 3, 2026 (UTC)', { exact: true })).toBeVisible();
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

    const selector = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
    const analysis = page.getByRole('region', { name: 'Selected instruments', exact: true });
    const selectorBox = await selector.boundingBox();
    const analysisBox = await analysis.boundingBox();
    if (!selectorBox || !analysisBox) throw new Error('Expected measured dashboard panels');
    expect(analysisBox.y).toBeGreaterThanOrEqual(selectorBox.y + selectorBox.height);
    await expectContainedDocument(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'View data', exact: true }).click();
    const table = page.getByRole('table', { name: 'Recorded closing prices' });
    await expect(table.getByRole('columnheader')).toHaveText(['Date (UTC)', 'TICK0001']);
    await expect(table.getByRole('rowheader')).toHaveText(
      expectedPrices.map((point) => dateLabel.format(new Date(`${point.date}T00:00:00.000Z`))),
    );
    await expect(table.getByRole('cell')).toHaveText(
      expectedPrices.map((point) => priceLabel.format(point.price)),
    );

    await page
      .getByRole('dialog', { name: 'Raw observations', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
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
      page
        .getByRole('group', { name: `${ticker} resources`, exact: true })
        .getByText('Not in this dataset', { exact: true }),
    ).toBeVisible();
    await expectContainedDocument(page);
  });

  test('keeps touch targets, chart inspection and the full table usable without page overflow', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
    await search.fill('0001');
    const add = page.getByRole('option', { name: 'TICK0001', exact: true });
    await expect(add).toBeVisible();
    expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await add.tap();
    await expect(search).toHaveValue('');
    await search.press('Escape');
    const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error('Expected a measured touch chart');
    expect(box.height).toBe(256);
    expect(box.width).toBeGreaterThan(200);
    await chart.tap({ position: { x: box.width - 20, y: 160 } });
    const details = page.getByRole('region', { name: 'Details for Historical closing prices' });
    await expect(details.getByText('Mon, Aug 3, 2026', { exact: true })).toBeVisible();
    await expect(details.getByText('172.89', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View data', exact: true }).tap();
    const tableRegion = page.getByRole('region', {
      name: 'Recorded closing prices',
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
    await page
      .getByRole('dialog', { name: 'Raw observations', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .tap();
    await page.getByRole('button', { name: 'Remove TICK0001', exact: true }).tap();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await search.press('Escape');
    await expect(page.getByRole('table', { name: 'Comparison', exact: true })).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
  });
});

test.describe('Inspect complete raw observations on demand', () => {
  test('contains modal focus and local scrolling while preserving the chart, page and cache', async ({
    page,
  }, testInfo) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) requests.push(path);
    });
    await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');
    for (const ticker of ['TICK0001', 'TICK0002', 'TICK0003']) {
      await expect(await matrixCell(page, ticker, 'Latest close')).toHaveText(/^[\d,]+\.\d{2}$/);
      await expect(await matrixCell(page, ticker, 'Total return')).toHaveText(
        /^[+−-]?\d+\.\d{2}%$/,
      );
    }
    const loaded = [...requests];
    expect(loaded).toHaveLength(7);
    const chart = page.getByRole('img', { name: 'Rebased price change', exact: true });
    const instance = await chart.elementHandle();
    if (!instance) throw new Error('Expected the mounted analysis chart.');
    const trigger = page.getByRole('button', { name: 'View data', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Raw observations', exact: true });
    // e2e-locator: The document root supplies page dimensions and its own browsing-context scroll position.
    const documentRoot = page.locator('html');
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('button', { name: /Show data table for/ })).toHaveCount(0);
      await expect(
        page.getByRole('table', { name: 'Recorded closing prices', exact: true }),
      ).toHaveCount(0);
      expect((await chart.boundingBox())?.height).toBe(viewport.width < 640 ? 256 : 320);
      await trigger.scrollIntoViewIfNeeded();
      const before = await documentRoot.evaluate((element) => ({
        scroll: element.ownerDocument.defaultView?.scrollY ?? 0,
        height: element.scrollHeight,
      }));
      await trigger.click();
      const close = dialog.getByRole('button', { name: 'Close', exact: true });
      const tableRegion = dialog.getByRole('region', {
        name: 'Recorded closing prices',
        exact: true,
      });
      const table = tableRegion.getByRole('table', {
        name: 'Recorded closing prices',
        exact: true,
      });
      await expect(close).toBeFocused();
      await expect(table.getByRole('columnheader')).toHaveText([
        'Date (UTC)',
        'TICK0001',
        'TICK0002',
        'TICK0003',
      ]);
      await expect(table.getByRole('rowheader')).toHaveCount(30);
      await expect(
        table.getByRole('row', {
          name: 'Tuesday, June 23, 2026 190.34 461.28 372.18',
          exact: true,
        }),
      ).toBeVisible();
      const bounds = await dialog.boundingBox();
      if (!bounds) throw new Error('Expected the actual modal bounds.');
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Shift+Tab');
      await expect(tableRegion).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.mouse.move(2, 2);
      await page.mouse.wheel(0, -600);
      await expect
        .poll(() =>
          documentRoot.evaluate((element) => element.ownerDocument.defaultView?.scrollY ?? 0),
        )
        .toBe(before.scroll);
      expect(await documentRoot.evaluate((element) => element.scrollHeight)).toBe(before.height);
      expect(await instance.evaluate((element) => element.isConnected)).toBe(true);
      expect(requests).toEqual(loaded);
      await page.screenshot({
        path: testInfo.outputPath(`raw-dialog-${viewport.width}-${viewport.height}.png`),
        fullPage: false,
      });
      // e2e-locator: The final direct Dialog child is its existing vertically scrolling content, below the fixed Close header.
      // e2e-ordinal: PharoDialog renders the fixed header first and its content as the final direct child.
      const content = dialog.locator(':scope > div').last();
      await table
        .getByRole('rowheader', { name: 'Monday, August 3, 2026', exact: true })
        .scrollIntoViewIfNeeded();
      expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const closeBounds = await close.boundingBox();
      if (!closeBounds) throw new Error('Expected a persistent visible dismissal control.');
      expect(closeBounds.y).toBeGreaterThanOrEqual(0);
      expect(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(viewport.height);
      if (viewport.width === 320) {
        const horizontal = await tableRegion.evaluate((element) => ({
          content: element.scrollWidth,
          width: element.clientWidth,
        }));
        expect(horizontal.content).toBeGreaterThan(horizontal.width);
        await tableRegion.press('ArrowRight');
        await expect
          .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
      await expectContainedDocument(page);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect
        .poll(() =>
          documentRoot.evaluate((element) => element.ownerDocument.defaultView?.scrollY ?? 0),
        )
        .toBe(before.scroll);
      expect(await documentRoot.evaluate((element) => element.scrollHeight)).toBe(before.height);
      await expect(page.getByRole('button', { name: /Show data table for/ })).toHaveCount(0);
      await trigger.click();
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect
        .poll(() =>
          documentRoot.evaluate((element) => element.ownerDocument.defaultView?.scrollY ?? 0),
        )
        .toBe(before.scroll);
      expect(await instance.evaluate((element) => element.isConnected)).toBe(true);
      expect(requests).toEqual(loaded);
    }
  });
});
