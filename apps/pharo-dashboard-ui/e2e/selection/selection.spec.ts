import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

async function addTicker(page: Page, ticker: string) {
  const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

  await input.fill(ticker);

  const option = page.getByRole('option', { name: ticker, exact: true });

  await expect(option).toBeVisible();
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await option.getAttribute('id')) ?? '',
  );

  await input.press('Enter');

  await expect(input).toHaveValue('');

  await input.press('Escape');
}

async function expectSelection(page: Page, tickers: readonly string[]) {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tickers') ?? '')
    .toBe(tickers.join(','));
  const table = page.getByRole('table', { name: 'Comparison', exact: true });

  if (tickers.length === 0) await expect(table).toHaveCount(0);
  else await expect(table.getByRole('columnheader')).toHaveText(['Metric', ...tickers]);
}

// This lane uses the compiled application and the actual owned C# process/CSV.
// Deliberate MSW failure and cancellation scenarios remain in the component/API tests.
test.describe('Mobile comparison navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('keeps metric labels visible while keyboard and touch reach all selected tickers', async ({
    page,
  }) => {
    await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');

    const area = page.getByRole('region', { name: 'Comparison table scroll area' });

    await expect(page.getByText('3 instruments · Swipe or scroll to compare.')).toBeVisible();
    await expect(area.getByRole('columnheader')).toHaveText([
      'Metric',
      'TICK0001',
      'TICK0002',
      'TICK0003',
    ]);

    await area.scrollIntoViewIfNeeded();
    const metric = area.getByRole('rowheader', { name: 'Latest close', exact: true });
    const labelLeft = (await metric.boundingBox())?.x;
    if (labelLeft === undefined) throw new Error('Metric label is missing.');
    await area.focus();

    const seen = new Set<string>();
    for (let step = 0; step < 14; step++) {
      const visible = await area.evaluate((element) => {
        const right = element.getBoundingClientRect().right;
        const labelRight = element.querySelector('th')?.getBoundingClientRect().right ?? 0;
        return [...element.querySelectorAll('thead th')]
          .filter((cell) => {
            const bounds = cell.getBoundingClientRect();
            return bounds.left >= labelRight - 1 && bounds.right <= right + 1;
          })
          .map((cell) => cell.textContent?.trim() ?? '');
      });
      visible.forEach((ticker) => seen.add(ticker));
      await area.press('ArrowRight');
    }

    expect([...seen].sort()).toEqual(['TICK0001', 'TICK0002', 'TICK0003']);
    expect((await metric.boundingBox())?.x).toBeCloseTo(labelLeft, 1);

    await area.evaluate((element) => {
      element.scrollLeft = 0;
    });
    const box = await area.boundingBox();
    if (!box) throw new Error('Scroll area is missing.');
    const session = await page.context().newCDPSession(page);
    await session.send('Input.synthesizeScrollGesture', {
      x: box.x + box.width - 20,
      y: box.y + box.height / 2,
      xDistance: -180,
      yDistance: 0,
      gestureSourceType: 'touch',
    });

    await expect.poll(() => area.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect((await metric.boundingBox())?.x).toBeCloseTo(labelLeft, 1);

    await session.detach();
  });
});

test.describe('Share a real historical-data selection', () => {
  test('keeps one data action when the instrument popup masks the surrounding dashboard', async ({
    page,
  }) => {
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');

      const chart = page.getByRole('img', { name: 'Rebased price change', includeHidden: true });

      await expect(chart).toBeVisible();

      const trigger = page.getByRole('button', { name: 'View data', exact: true });
      const triggerId = await trigger.getAttribute('id');
      if (!triggerId) throw new Error('The external data action needs a stable association.');
      const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

      await input.fill('TICK000');
      await input.press('ArrowDown');

      await expect(page.getByRole('listbox')).toBeVisible();
      await expect(chart).toHaveAttribute('aria-details', triggerId);
      await expect(
        page.getByRole('button', { name: /^Show data table/, includeHidden: true }),
      ).toHaveCount(0);

      await input.press('Escape');
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: 'Raw observations', exact: true });

      await expect(dialog.getByRole('table', { name: 'Recorded closing prices' })).toBeVisible();

      await dialog.getByRole('button', { name: 'Close', exact: true }).press('Escape');

      await expect(trigger).toBeFocused();
      await expect(chart).toHaveAttribute('aria-details', triggerId);
    }
  });

  test('selects with keyboard, reuses cached resources, and preserves history and reload', async ({
    page,
  }, testInfo) => {
    const priceRequests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/prices/')) priceRequests.push(path);
    });
    const instrumentsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/instruments' && response.status() === 200,
    );

    await page.goto('/');

    const instruments: unknown = await (await instrumentsResponse).json();

    expect(Array.isArray(instruments)).toBe(true);
    if (!Array.isArray(instruments)) throw new Error('Expected real instrument response');
    expect(instruments).toHaveLength(200);
    expect(new Set(instruments).size).toBe(200);
    await expect(
      page.getByText('Select an instrument to view its prices and statistics.', { exact: true }),
    ).toBeVisible();

    await addTicker(page, 'TICK0001');
    await expectSelection(page, ['TICK0001']);

    await expect(page.getByText('30 observations', { exact: true })).toBeVisible();
    await expect(page.getByText('Jun 23 – Aug 3, 2026 (UTC)', { exact: true })).toBeVisible();
    await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
    await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');

    await addTicker(page, 'TICK0002');
    await expectSelection(page, ['TICK0001', 'TICK0002']);

    await expect(await matrixCell(page, 'TICK0002', 'Latest close')).toHaveText('412.88');
    await expect(await matrixCell(page, 'TICK0002', 'Total return')).toHaveText('-10.49%');

    const loadedRequests = [...priceRequests];
    await page.screenshot({ path: testInfo.outputPath('selection-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Remove TICK0001', exact: true }).click();
    await expectSelection(page, ['TICK0002']);
    const input = page.getByRole('combobox', { name: 'Compare instruments' });

    await input.fill('TICK0001');
    await page.goBack();

    await expect(page.getByRole('option', { name: 'TICK0001', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(input).toHaveValue('TICK0001');

    await input.press('Escape');
    await expectSelection(page, ['TICK0001', 'TICK0002']);

    await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
    expect(priceRequests).toEqual(loadedRequests);

    await page.goBack();
    await expectSelection(page, ['TICK0001']);
    await page.goForward();
    await expectSelection(page, ['TICK0001', 'TICK0002']);

    expect(priceRequests).toEqual(loadedRequests);

    await page.reload();
    await expectSelection(page, ['TICK0001', 'TICK0002']);

    await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');

    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await page.getByRole('combobox', { name: 'Compare instruments' }).press('Escape');
    await expectSelection(page, []);
    await page.goBack();
    await expectSelection(page, ['TICK0001', 'TICK0002']);
  });

  test('retains the original over-limit link until an intentional selection change', async ({
    page,
  }) => {
    const raw = '?tickers=%20tick0001%20,TICK0001,TICK0002,TICK0003,TICK0004';

    await page.goto(`/${raw}`);

    await expect(
      page.getByText('Only the first three instruments in this link are selected.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe(raw);
    await expect(
      page.getByRole('table', { name: 'Comparison', exact: true }).getByRole('columnheader'),
    ).toHaveText(['Metric', 'TICK0001', 'TICK0002', 'TICK0003']);

    const input = page.getByRole('combobox', { name: 'Compare instruments' });

    await input.fill('TICK0004');

    await expect(page.getByRole('option', { name: 'TICK0004', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await input.press('Enter');
    await input.press('Escape');

    await expect(input).toHaveAccessibleDescription(/Remove one to add another/);
    expect(new URL(page.url()).search).toBe(raw);

    await page.getByRole('button', { name: 'Remove TICK0002', exact: true }).click();
    await expectSelection(page, ['TICK0001', 'TICK0003']);

    await expect(
      page.getByText('Only the first three instruments in this link are selected.', {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  for (const raw of ['?tickers=AAA&tickers=BBB', '?tickers=%5B%22TICK0001%22%5D', '?tickers=%ZZ']) {
    test.describe(`Malformed direct selection ${raw}`, () => {
      test('recovers safely using a valid instrument', async ({ page }) => {
        await page.goto(`/${raw}`);

        await expect(
          page.getByText("The link's instrument selection is invalid.", { exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('table', { name: 'Comparison', exact: true })).toHaveCount(0);

        await addTicker(page, 'TICK0001');
        await expectSelection(page, ['TICK0001']);

        await expect(
          page.getByText("The link's instrument selection is invalid.", { exact: true }),
        ).toHaveCount(0);
        await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');
      });
    });
  }

  test('keeps numeric and TRUE-like identifiers selected with actual independent 404 feedback', async ({
    page,
  }, testInfo) => {
    const missing: string[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/prices/') && response.status() === 404) missing.push(path);
    });
    await page.goto('/?tickers=123,TRUE,NULL');
    await expectSelection(page, ['123', 'TRUE', 'NULL']);

    for (const ticker of ['123', 'TRUE', 'NULL']) {
      const resources = page.getByRole('group', { name: `${ticker} resources`, exact: true });

      await expect(resources.getByText('Not in this dataset', { exact: true })).toHaveCount(1);
      await expect(resources.getByRole('button', { name: /Retry/ })).toHaveCount(0);
    }

    await expect
      .poll(() => new Set(missing))
      .toEqual(
        new Set([
          '/api/prices/123',
          '/api/prices/123/stats',
          '/api/prices/TRUE',
          '/api/prices/TRUE/stats',
          '/api/prices/NULL',
          '/api/prices/NULL/stats',
        ]),
      );
    await page.getByRole('button', { name: 'Remove TRUE', exact: true }).click();
    await addTicker(page, 'TICK0001');
    await expectSelection(page, ['123', 'NULL', 'TICK0001']);

    await expect(await matrixCell(page, 'TICK0001', 'Latest close')).toHaveText('172.89');

    await page.setViewportSize({ width: 320, height: 800 });
    // Traverse away and back with native Tab so the actual missing-instrument action receives keyboard focus.
    const remove = page.getByRole('button', { name: 'Remove 123 from comparison', exact: true });

    await remove.press('Tab');
    await page.keyboard.press('Shift+Tab');

    await expect(remove).toBeFocused();
    await expect(remove).toHaveCSS('outline', 'rgb(0, 111, 166) solid 3px');
    // e2e-locator: document dimensions establish that narrow comparison columns do not overflow the viewport.
    expect(
      await page
        .locator('html')
        .evaluate(
          (element: { scrollWidth: number; clientWidth: number }) =>
            element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath('selection-narrow-partial.png'),
      fullPage: true,
    });
  });

  test('returns focus to the actual picker when removing the last missing column', async ({
    page,
  }) => {
    await page.goto('/?tickers=UNKNOWN');

    const resources = page.getByRole('group', { name: 'UNKNOWN resources', exact: true });

    await expect(resources.getByText('Not in this dataset', { exact: true })).toBeVisible();

    await resources
      .getByRole('button', { name: 'Remove UNKNOWN from comparison', exact: true })
      .press('Enter');

    await expect.poll(() => new URL(page.url()).searchParams.get('tickers')).toBeNull();

    const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

    await expect(input).toBeFocused();

    await input.press('Escape');
    await expectSelection(page, []);
  });
});

function deferredRequest() {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

async function expectContainedDocument(page: Page) {
  // e2e-locator: Root dimensions distinguish a contained popup from page overflow.
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
}

for (const viewport of [
  { width: 1366, height: 768, touch: false },
  { width: 390, height: 844, touch: true },
]) {
  test.describe(`Instrument loading at ${viewport.width}px`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
    });

    test('keeps initial loading inside the picker and preserves selection after it resolves', async ({
      page,
    }, testInfo) => {
      const request = deferredRequest();
      await page.route('**/api/instruments', async (route) => {
        await request.pending;
        await route.continue();
      });
      await page.goto('/');

      const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
      const trigger = page.getByRole('button', { name: /^Show options/ });
      const announcement = page.getByRole('status').filter({ hasText: 'Loading instruments…' });

      await expect(input).toHaveAttribute('aria-busy', 'true');
      await expect(input).toBeEnabled();
      await expect(trigger.getByRole('progressbar', { includeHidden: true })).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      await expect(announcement).toHaveCount(1);
      expect((await announcement.boundingBox())?.height).toBeLessThanOrEqual(1);

      await page.screenshot({ path: testInfo.outputPath('loading-closed.png'), fullPage: true });

      if (viewport.touch) await input.tap();
      else await input.press('ArrowDown');
      const listbox = page.getByRole('listbox');

      await expect(listbox).toBeVisible();
      await expect(announcement).toHaveCount(1);
      await expect(listbox.getByRole('status')).toHaveText('Loading instruments…');
      // React Aria wraps renderEmptyState in a nonselectable option without aria-selected.
      await expect(listbox.getByRole('option')).not.toHaveAttribute('aria-selected', /.+/);
      await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);

      await input.press('Enter');

      expect(new URL(page.url()).search).toBe('');

      await input.press('ArrowDown');

      await expect(listbox.getByRole('status')).toHaveText('Loading instruments…');

      await expectContainedDocument(page);
      await page.screenshot({ path: testInfo.outputPath('loading-open.png'), fullPage: true });
      await input.press('Escape');

      await expect(listbox).toBeHidden();
      await expect(input).toBeFocused();

      request.release();

      await expect(input).not.toHaveAttribute('aria-busy', 'true');
      await expect(announcement).toHaveCount(0);
      await expect(trigger.getByRole('progressbar', { includeHidden: true })).toHaveCount(0);

      await input.fill('not-an-instrument');

      await expect(
        listbox.getByText('No instruments match your search.', { exact: true }),
      ).toBeVisible();
      await expect(listbox.getByRole('option')).not.toHaveAttribute('aria-selected', /.+/);
      await expect(page.getByRole('progressbar', { includeHidden: true })).toHaveCount(0);

      await input.fill('TICK0001');

      const option = page.getByRole('option', { name: 'TICK0001', exact: true });

      await expect(option).toBeVisible();
      if (viewport.touch) {
        expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        await option.tap();
      } else {
        await expect(input).toHaveAttribute(
          'aria-activedescendant',
          (await option.getAttribute('id')) ?? '',
        );

        await input.press('Enter');
      }
      await expect.poll(() => new URL(page.url()).searchParams.get('tickers')).toBe('TICK0001');
      await expect(input).toHaveValue('');

      await input.press('Escape');

      await expect(input).toBeFocused();
      await expect(
        page.getByRole('img', { name: 'Historical closing prices', exact: true }),
      ).toBeVisible();

      await expectContainedDocument(page);
    });

    test('keeps retry outside the choices and recovers to the actual instrument list', async ({
      page,
    }, testInfo) => {
      const retry = deferredRequest();
      let requests = 0;
      await page.route('**/api/instruments', async (route) => {
        requests += 1;
        if (requests === 1) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
          return;
        }
        await retry.pending;
        await route.continue();
      });
      await page.goto('/');

      const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
      const error = page
        .getByRole('alert')
        .filter({ hasText: 'The service could not complete the request.' });
      const retryButton = page.getByRole('button', { name: 'Retry instruments', exact: true });

      await expect(error).toBeVisible();
      await expect(retryButton).toBeEnabled();
      await expect(page.getByRole('progressbar', { includeHidden: true })).toHaveCount(0);
      await expect(
        page.getByRole('status').filter({ hasText: 'Loading instruments…' }),
      ).toHaveCount(0);

      await page.screenshot({ path: testInfo.outputPath('loading-error.png'), fullPage: true });
      if (viewport.touch) await input.tap();
      else await input.press('ArrowDown');
      const listbox = page.getByRole('listbox');

      await expect(
        listbox.getByText('Instrument list unavailable. Close options to retry.', { exact: true }),
      ).toBeVisible();
      await expect(listbox.getByRole('button', { name: /Retry/ })).toHaveCount(0);
      await expect(listbox.getByRole('option')).not.toHaveAttribute('aria-selected', /.+/);

      await expectContainedDocument(page);
      await page.screenshot({
        path: testInfo.outputPath('loading-error-open.png'),
        fullPage: true,
      });
      await input.press('Escape');

      await expect(input).toBeFocused();
      if (viewport.touch) {
        expect((await retryButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        await retryButton.tap();
      } else await retryButton.press('Enter');
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await expect(
        page.getByRole('status').filter({ hasText: 'Loading instruments…' }),
      ).toHaveCount(1);
      await expect(error).toHaveCount(0);

      retry.release();

      await expect(input).not.toHaveAttribute('aria-busy', 'true');
      await expect(input).toBeFocused();
      await expect(retryButton).toHaveCount(0);

      await input.fill('TICK0001');

      await expect(page.getByRole('option', { name: 'TICK0001', exact: true })).toBeVisible();

      await input.press('Escape');

      await expect(input).toBeFocused();
      expect(requests).toBe(2);

      await expectContainedDocument(page);
    });
  });
}
