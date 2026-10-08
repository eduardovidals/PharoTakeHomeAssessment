import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

async function recordedPrices() {
  const csv = await readFile(
    new URL('../../../pharo-dashboard-api/Data/market_data.csv', import.meta.url),
    'utf8',
  );
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [date, ticker, price] = line.split(',');
      return ticker === 'TICK0001' && date && price ? [{ date, price: Number(price) }] : [];
    });
}

test.describe('Present recorded prices with consistent UTC labels', () => {
  test('human UTC presentation and canonical observations agree across browser timezones', async ({
    browser,
    baseURL,
  }) => {
    const expected = await recordedPrices();
    expect(expected).toHaveLength(30);
    let reference: string[] | undefined;
    for (const timezoneId of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      const context = await browser.newContext({
        baseURL,
        timezoneId,
        viewport: { width: 1440, height: 900 },
      });
      try {
        const page = await context.newPage();
        const failures: string[] = [];
        const requests: string[] = [];
        page.on('pageerror', (error) => failures.push(error.message));
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname;
          if (path.startsWith('/api/')) requests.push(path);
        });
        const response = page.waitForResponse(
          (entry) => new URL(entry.url()).pathname === '/api/prices/TICK0001',
        );
        await page.goto('/?tickers=TICK0001');
        expect(await (await response).json()).toEqual(expected);
        const prices = page.getByRole('region', { name: 'TICK0001 prices', exact: true });
        await expect(prices.getByText('Jun 23, 2026', { exact: true })).toHaveAttribute(
          'datetime',
          '2026-06-23',
        );
        await expect(prices.getByText('Aug 3, 2026', { exact: true })).toHaveAttribute(
          'datetime',
          '2026-08-03',
        );
        await expect(page.getByText('Jun 23 – Aug 3, 2026 (UTC)', { exact: true })).toBeVisible();
        await expect(
          page
            .getByRole('region', { name: 'TICK0001 statistics', exact: true })
            .getByRole('definition')
            .filter({ hasText: '-9.17%' }),
        ).toBeVisible();
        const before = [...requests];
        const inspector = page.getByRole('slider', { name: 'Inspect Historical closing prices' });
        const details = page.getByRole('region', { name: 'Details for Historical closing prices' });
        await expect(details.getByText('Mon, Aug 3, 2026', { exact: true })).toBeVisible();
        await expect(inspector).toHaveAttribute('aria-valuetext', /Monday, August 3, 2026/);
        await inspector.press('Home');
        await expect(details.getByText('Tue, Jun 23, 2026', { exact: true })).toBeVisible();
        await inspector.press('End');
        await expect(details.getByText('Mon, Aug 3, 2026', { exact: true })).toBeVisible();
        await expect(details.getByText('172.89', { exact: true })).toBeVisible();
        const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
        // e2e-locator: SVG UTC tick titles retain complete labels; visible text is a separate text node.
        const labels = await chart
          .locator('g[aria-label="UTC time axis"] text')
          .evaluateAll((elements) =>
            elements.map((element) =>
              [...element.childNodes]
                .filter((node) => node.nodeType === node.TEXT_NODE)
                .map((node) => node.textContent)
                .join(''),
            ),
          );
        expect(labels.length).toBeGreaterThan(1);
        if (reference) expect(labels).toEqual(reference);
        else reference = labels;
        await page
          .getByRole('button', { name: 'Show data table for Historical closing prices' })
          .click();
        const table = page.getByRole('table', { name: 'Data for Historical closing prices' });
        await expect(table.getByRole('rowheader')).toHaveCount(30);
        await expect(
          table.getByRole('rowheader', { name: 'Tuesday, June 23, 2026', exact: true }),
        ).toHaveText('Jun 23, 2026');
        await expect(table.getByText('Jun 23, 2026', { exact: true })).toHaveAttribute(
          'datetime',
          '2026-06-23T00:00:00.000Z',
        );
        await expect(
          table.getByRole('row', { name: 'Tuesday, June 23, 2026 190.34', exact: true }),
        ).toBeVisible();
        expect(requests).toEqual(before);
        expect(failures).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });

  test('recorded UTC ticks remain readable at mobile and desktop widths', async ({
    page,
  }, testInfo) => {
    const prices = await recordedPrices();
    const recordedLabels = new Set(
      prices.map((point) => shortDate.format(new Date(`${point.date}T00:00:00.000Z`))),
    );
    await page.goto('/?tickers=TICK0001');
    const chart = page.getByRole('img', { name: 'Historical closing prices', exact: true });
    await expect(chart).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await chart.scrollIntoViewIfNeeded();
      // e2e-locator: The actual SVG time-axis text bounds prove label containment and spacing.
      const ticks = chart.locator('g[aria-label="UTC time axis"] text');
      await expect.poll(async () => ticks.count()).toBeGreaterThan(0);
      const bounds = await chart.boundingBox();
      if (!bounds) throw new Error('Expected a measured public chart.');
      const labels = await ticks.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: [...element.childNodes]
              .filter((node) => node.nodeType === node.TEXT_NODE)
              .map((node) => node.textContent)
              .join(''),
            left: rect.left,
            right: rect.right,
          };
        }),
      );
      for (const [index, label] of labels.entries()) {
        expect(recordedLabels.has(label.text)).toBe(true);
        expect(label.left).toBeGreaterThanOrEqual(bounds.x);
        expect(label.right).toBeLessThanOrEqual(bounds.x + bounds.width);
        const previous = labels[index - 1];
        if (previous) expect(label.left - previous.right).toBeGreaterThanOrEqual(4);
      }
      if (width >= 390) {
        expect(labels[0]?.text).toBe('Jun 23');
        expect(labels.at(-1)?.text).toBe('Aug 3');
      }
      // e2e-locator: Path bytes expose nonfinite geometry without substituting a mocked chart.
      for (const data of await chart
        .locator('path')
        .evaluateAll((paths) => paths.map((path) => path.getAttribute('d'))))
        expect(data).not.toMatch(/NaN|Infinity/);
      // e2e-locator: The document root distinguishes local chart sizing from page overflow.
      expect(
        await page
          .locator('html')
          .evaluate((element: { scrollWidth: number }) => element.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await chart.screenshot({ path: testInfo.outputPath(`recorded-ticks-${width}.png`) });
    }
  });
});
