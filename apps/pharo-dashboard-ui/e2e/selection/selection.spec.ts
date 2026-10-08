import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
  const selected = page.getByRole('region', { name: 'Selected instruments', exact: true });
  await expect(selected.getByRole('article')).toHaveCount(tickers.length);
  for (const ticker of tickers) {
    await expect(
      selected.getByRole('article', { name: `${ticker} market data`, exact: true }),
    ).toBeVisible();
  }
}

// This lane uses the compiled application and the actual owned C# process/CSV.
// Deliberate MSW failure and cancellation scenarios remain in the component/API tests.
test.describe('Share a real historical-data selection', () => {
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
    const firstPrices = page.getByRole('region', { name: 'TICK0001 prices', exact: true });
    await expect(firstPrices.getByText('30', { exact: true })).toBeVisible();
    await expect(firstPrices.getByText('Aug 3, 2026', { exact: true })).toBeVisible();
    await expect(firstPrices.getByText('172.89', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'TICK0001 statistics' })
        .getByText('Total return', { exact: true }),
    ).toBeVisible();
    await addTicker(page, 'TICK0002');
    await expectSelection(page, ['TICK0001', 'TICK0002']);
    await expect(
      page
        .getByRole('region', { name: 'TICK0002 prices', exact: true })
        .getByText('30', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'TICK0002 statistics', exact: true })
        .getByText('Total return', { exact: true }),
    ).toBeVisible();
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
    await expect(firstPrices.getByText('172.89', { exact: true })).toBeVisible();
    expect(priceRequests).toEqual(loadedRequests);
    await page.goBack();
    await expectSelection(page, ['TICK0001']);
    await page.goForward();
    await expectSelection(page, ['TICK0001', 'TICK0002']);
    expect(priceRequests).toEqual(loadedRequests);
    await page.reload();
    await expectSelection(page, ['TICK0001', 'TICK0002']);
    await expect(firstPrices.getByText('172.89', { exact: true })).toBeVisible();
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
    const selected = page.getByRole('region', { name: 'Selected instruments', exact: true });
    await expect(selected.getByRole('article')).toHaveCount(3);
    for (const ticker of ['TICK0001', 'TICK0002', 'TICK0003']) {
      await expect(
        selected.getByRole('article', { name: `${ticker} market data`, exact: true }),
      ).toBeVisible();
    }
    const input = page.getByRole('combobox', { name: 'Compare instruments' });
    await input.fill('TICK0004');
    await expect(page.getByRole('option', { name: 'TICK0004', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await input.press('Enter');
    await input.press('Escape');
    await expect(input).toHaveAccessibleDescription(
      /Up to 3 instruments. Remove one to add another/,
    );
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
        await expect(
          page
            .getByRole('region', { name: 'Selected instruments', exact: true })
            .getByRole('article'),
        ).toHaveCount(0);
        await addTicker(page, 'TICK0001');
        await expectSelection(page, ['TICK0001']);
        await expect(
          page.getByText("The link's instrument selection is invalid.", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page
            .getByRole('region', { name: 'TICK0001 prices', exact: true })
            .getByText('172.89', { exact: true }),
        ).toBeVisible();
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
      await expect(
        page.getByRole('region', { name: `${ticker} prices`, exact: true }).getByRole('alert'),
      ).toHaveText('Instrument not found.');
      await expect(
        page.getByRole('region', { name: `${ticker} statistics`, exact: true }).getByRole('alert'),
      ).toHaveText('Instrument not found.');
    }
    expect(new Set(missing)).toEqual(
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
    await expect(
      page
        .getByRole('region', { name: 'TICK0001 prices', exact: true })
        .getByText('172.89', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 800 });
    // Traverse away and back with native Tab so the actual retry receives keyboard focus.
    const retry = page.getByRole('button', { name: 'Retry 123 prices', exact: true });
    await retry.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(retry).toBeFocused();
    await expect(retry).toHaveCSS('outline', 'rgb(0, 111, 166) solid 3px');
    // e2e-locator: document dimensions establish that narrow resource cards do not overflow the viewport.
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
});
