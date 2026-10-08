import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const output = process.env.PHARO_SCREENSHOT_DIR
  ? resolve(process.env.PHARO_SCREENSHOT_DIR)
  : fileURLToPath(new URL('../../../screenshots/', import.meta.url));

test.use({ actionTimeout: 10000 });

test.describe('Review the dashboard screens and interactions', () => {
  test('capture the dashboard screens and interactions as numbered PNGs', async ({ page }) => {
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    let number = 0;
    async function capture(name: string, screen: Page = page) {
      const filename = `${String(++number).padStart(2, '0')}-${name}.png`;
      await screen.screenshot({
        path: join(output, filename),
        fullPage: true,
        animations: 'disabled',
      });
      console.log(filename);
    }
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const search = page.getByRole('combobox', { name: 'Compare instruments', exact: true });
    const option = (ticker: string) => page.getByRole('option', { name: ticker, exact: true });
    async function add(ticker: string) {
      await search.fill(ticker);
      await option(ticker).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get('tickers')?.split(',').includes(ticker))
        .toBe(true);
      await expect(search).toHaveValue('');
      await search.press('Escape');
    }
    async function ready(tickers: string[]) {
      for (const ticker of tickers) {
        await expect(
          page.getByRole('region', { name: `${ticker} prices`, exact: true }),
        ).toContainText('Latest close');
        await expect(
          page.getByRole('region', { name: `${ticker} statistics`, exact: true }),
        ).toContainText('Total return');
      }
    }

    // Normal flows use the real application, API and supplied CSV.
    await page.goto('/');
    await search.focus();
    await expect(option('TICK0001')).toBeVisible();
    await search.press('Escape');
    await capture('desktop-initial-empty-selection');
    await search.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await capture('focused-picker-all-instruments');
    await option('TICK0001').hover();
    await capture('instrument-option-hover');
    await page.mouse.down();
    await capture('instrument-option-pressed');
    await page.mouse.up();
    await expect.poll(() => new URL(page.url()).searchParams.get('tickers')).toBe('TICK0001');
    await expect(search).toHaveValue('');
    await search.press('Escape');
    await ready(['TICK0001']);
    await capture('single-instrument-chart-and-statistics');

    const inspector = page.getByRole('slider', { name: 'Inspect Historical closing prices' });
    await inspector.press('End');
    await expect(
      page.getByRole('region', { name: 'Details for Historical closing prices' }),
    ).toContainText('Mon, Aug 3, 2026');
    await capture('chart-last-date-keyboard-focus');
    await inspector.press('Home');
    await capture('chart-first-date');
    await button('Show data table for Historical closing prices').click();
    await expect(
      page.getByRole('table', { name: 'Data for Historical closing prices' }),
    ).toBeVisible();
    await capture('expanded-price-data-table');
    await button('Hide data table for Historical closing prices').click();

    await add('TICK0002');
    await ready(['TICK0001', 'TICK0002']);
    await capture('two-instrument-comparison');
    await add('TICK0003');
    await ready(['TICK0001', 'TICK0002', 'TICK0003']);
    await capture('three-instrument-performance-comparison');
    await page
      .getByRole('radiogroup', { name: 'Chart view' })
      .getByText('Price', { exact: true })
      .click();
    await capture('three-instrument-price-comparison');
    await search.fill('TICK0004');
    await expect(option('TICK0004')).toBeDisabled();
    await capture('fourth-instrument-disabled-option');
    await search.press('Escape');
    await expect(page.getByText(/Up to 3 instruments\. Remove one to add another\./)).toBeVisible();
    await capture('selection-limit-help');
    await button('Remove TICK0002').click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('tickers')?.includes('TICK0002'))
      .toBe(false);
    await search.press('Escape');
    await expect(button('Remove TICK0002')).toHaveCount(0);
    await capture('remove-selection-tag');
    await button('Remove TICK0003').focus();
    await button('Remove TICK0003').press('Enter');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('tickers')?.includes('TICK0003'))
      .toBe(false);
    await search.press('Escape');
    await expect(button('Remove TICK0003')).toHaveCount(0);
    await capture('remove-tag-with-keyboard');
    await button('Clear selection').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tickers')).toBeNull();
    await search.press('Escape');
    await expect(page.getByText('Start with an instrument', { exact: true })).toBeVisible();
    await capture('clear-selection');

    await search.fill('0001');
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
    await capture('search-filter');
    await search.press('Escape');
    await capture('search-clear-button');
    await button('Clear search').click();
    await expect(search).toHaveValue('');
    await capture('search-cleared-input-focus');
    await search.fill('TICK0001');
    await search.press('ArrowDown');
    await capture('active-result-keyboard-focus');
    await search.fill('NO MATCH');
    await expect(
      page.getByText('No instruments match your search.', { exact: true }),
    ).toBeVisible();
    await capture('search-no-results');
    await search.press('Escape');
    await button('Clear search').click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(200);
    await option('TICK0200').scrollIntoViewIfNeeded();
    await expect(option('TICK0200')).toBeVisible();
    await capture('last-instrument-reachable-in-popup');
    await search.fill('0200');
    await expect(option('TICK0200')).toBeVisible();
    await capture('last-instrument-found-by-search');
    await search.press('Escape');

    await page.goto('/?tickers=TICK0001,TICK0002,TICK0003,TICK0004');
    await ready(['TICK0001', 'TICK0002', 'TICK0003']);
    await expect(
      page.getByText('Only the first three instruments in this link are selected.'),
    ).toBeVisible();
    await capture('shared-link-selection-limit');
    await page.goto('/?tickers=AAA&tickers=BBB');
    await expect(page.getByText("The link's instrument selection is invalid.")).toBeVisible();
    await capture('invalid-shared-link');
    await page.goto('/?tickers=UNKNOWN');
    await expect(page.getByRole('alert')).toHaveCount(2);
    await capture('unknown-instrument-not-found');
    await page.goto('/?tickers=TICK0001,UNKNOWN,TICK0002');
    await ready(['TICK0001', 'TICK0002']);
    await expect(page.getByRole('alert')).toHaveCount(2);
    await capture('partial-comparison-with-unavailable-instrument');

    // Deliberately held/faulted browser responses expose otherwise transient states.
    // These screenshots are labeled simulated; successful/retry data comes from the real API.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/**', async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/?tickers=TICK0001');
      await expect(
        page.getByRole('status').filter({ hasText: 'Loading instruments…' }),
      ).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'Loading TICK0001 prices', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'Loading TICK0001 statistics', exact: true }),
      ).toBeVisible();
      await capture('simulated-loading-list-prices-and-statistics');
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await ready(['TICK0001']);

    for (const [resource, route, retry] of [
      ['instrument-list', '**/api/instruments', 'Retry instruments'],
      ['prices', '**/api/prices/TICK0001', 'Retry TICK0001 prices'],
      ['statistics', '**/api/prices/TICK0001/stats', 'Retry TICK0001 statistics'],
    ] as const) {
      await page.route(route, (request) =>
        request.fulfill({ status: 400, json: { title: 'Screenshot scenario' } }),
      );
      await page.goto('/?tickers=TICK0001');
      await expect(button(retry)).toBeVisible();
      if (resource !== 'prices')
        await expect(
          page.getByRole('img', { name: 'Historical closing prices', exact: true }),
        ).toBeVisible();
      if (resource !== 'statistics')
        await expect(
          page.getByRole('region', { name: 'TICK0001 statistics', exact: true }),
        ).toContainText('Total return');
      await capture(`simulated-${resource}-error-retry-button`);
      await page.unrouteAll({ behavior: 'wait' });
      await button(retry).click();
      await ready(['TICK0001']);
      await search.fill('TICK0002');
      await search.press('ArrowDown');
      await expect(option('TICK0002')).toBeVisible();
      await search.press('Escape');
      await expect(button(retry)).toHaveCount(0);
      await capture(`${resource}-retry-recovered`);
    }

    await page.route('**/api/instruments', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await search.focus();
    await expect(page.getByText('No instruments are available.', { exact: true })).toBeVisible();
    await capture('simulated-empty-instrument-list');
    await page.unrouteAll({ behavior: 'wait' });
    await page.route('**/api/prices/TICK0001', (route) => route.fulfill({ json: [] }));
    await page.goto('/?tickers=TICK0001');
    await expect(page.getByText('No recorded prices are available for TICK0001.')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'TICK0001 statistics', exact: true }),
    ).toContainText('Total return');
    await capture('simulated-empty-price-history');
    await page.unrouteAll({ behavior: 'wait' });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tickers=TICK0001,TICK0002,TICK0003&view=price');
    await ready(['TICK0001', 'TICK0002', 'TICK0003']);
    await capture('tablet-three-instrument-comparison');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile-three-instrument-comparison');
    await button('Show data table for Historical closing prices').click();
    await capture('mobile-expanded-comparison-table');
    await button('Hide data table for Historical closing prices').click();
    await inspector.press('End');
    await capture('mobile-chart-inspection');
    await button('Clear selection').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tickers')).toBeNull();
    await expect(page.getByText('Start with an instrument', { exact: true })).toBeVisible();
    await search.press('Escape');
    await capture('mobile-empty-selection');
    await search.press('ArrowDown');
    await expect(option('TICK0001')).toBeVisible();
    await capture('mobile-instrument-popup');
    console.log(`Saved ${number} PNG screenshots to ${output}`);
  });
});
