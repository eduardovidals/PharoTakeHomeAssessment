import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const output = fileURLToPath(new URL('../../../screenshots/', import.meta.url));

test.describe('Review the dashboard screens and interactions', () => {
  test('capture the dashboard screens and interactions as numbered PNGs', async ({ page }) => {
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    let number = 0;
    async function capture(name: string, screen: Page = page) {
      const filename = `${String(++number).padStart(2, '0')}-${name}.png`;
      await screen.screenshot({ path: output + filename, fullPage: true, animations: 'disabled' });
      console.log(filename);
    }
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const search = page.getByRole('textbox', { name: 'Search instruments', exact: true });
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
    await expect(button('Add TICK0001')).toBeVisible();
    await capture('desktop-initial-empty-selection');
    await button('Add TICK0001').hover();
    await capture('add-button-hover');
    await page.mouse.down();
    await capture('add-button-pressed');
    await page.mouse.up();
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

    await button('Add TICK0002').click();
    await ready(['TICK0001', 'TICK0002']);
    await capture('two-instrument-comparison');
    await button('Add TICK0003').click();
    await ready(['TICK0001', 'TICK0002', 'TICK0003']);
    await capture('three-instrument-performance-comparison');
    await page
      .getByRole('radiogroup', { name: 'Chart view' })
      .getByText('Price', { exact: true })
      .click();
    await capture('three-instrument-price-comparison');
    await button('Add TICK0004').click();
    await expect(
      page.getByText('You can compare up to three instruments. Remove one before adding another.'),
    ).toBeVisible();
    await capture('fourth-instrument-limit-notice');
    await button('Remove selected TICK0002').click();
    await expect(button('Remove selected TICK0002')).toHaveCount(0);
    await capture('remove-selection-chip');
    await button('Remove TICK0003').click();
    await expect(button('Remove selected TICK0003')).toHaveCount(0);
    await capture('remove-from-instrument-list');
    await button('Clear selection').click();
    await expect(page.getByText('Start with an instrument', { exact: true })).toBeVisible();
    await capture('clear-selection');

    await search.fill('0001');
    await expect(
      page.getByRole('list', { name: 'Instrument results' }).getByRole('button'),
    ).toHaveCount(1);
    await capture('search-filter-and-clear-button');
    await search.press('Tab');
    await page.keyboard.press('Tab');
    await expect(button('Add TICK0001')).toBeFocused();
    await capture('add-button-keyboard-focus');
    await search.fill('NO MATCH');
    await expect(
      page.getByText('No instruments match your search.', { exact: true }),
    ).toBeVisible();
    await capture('search-no-results');
    await button('Clear search').click();
    await button('Next page').click();
    await expect(button('Add TICK0011')).toBeVisible();
    await capture('pagination-next-page');
    for (let current = 2; current < 20; current += 1) await button('Next page').click();
    await expect(button('Next page')).toBeDisabled();
    await capture('pagination-last-page-disabled-next');
    await button('Previous page').click();
    await expect(button('Add TICK0181')).toBeVisible();
    await capture('pagination-previous-page');

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
        page.getByRole('progressbar', { name: 'Loading instruments', exact: true }),
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
      await expect(button('Add TICK0002')).toBeVisible();
      await expect(button(retry)).toHaveCount(0);
      await capture(`${resource}-retry-recovered`);
    }

    await page.route('**/api/instruments', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
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
    await expect(page.getByText('Start with an instrument', { exact: true })).toBeVisible();
    await capture('mobile-empty-selection');
    console.log(`Saved ${number} PNG screenshots to ${output}`);
  });
});
