import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
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
        await expect(page.getByText('Jun 23 – Aug 3, 2026 (UTC)', { exact: true })).toBeVisible();
        await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');

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

        await page.getByRole('button', { name: 'View data', exact: true }).click();
        const table = page.getByRole('table', { name: 'Recorded closing prices' });

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
        await expect(table.getByText('Aug 3, 2026', { exact: true })).toHaveAttribute(
          'datetime',
          '2026-08-03T00:00:00.000Z',
        );

        await page
          .getByRole('dialog', { name: 'Raw observations', exact: true })
          .getByRole('button', { name: 'Close', exact: true })
          .click();

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

test.describe('Preserve analytical access with text scaling and user display preferences', () => {
  test('keeps the picker, matrix and raw dialog usable under enlarged text, reduced motion and forced colors', async ({
    browser,
    baseURL,
  }, testInfo) => {
    for (const scenario of [
      {
        name: 'root-text-scaling-200-percent',
        width: 640,
        height: 900,
        scaleText: true,
        reducedMotion: 'no-preference',
        forcedColors: 'none',
      },
      {
        name: 'reduced-motion-320-reflow',
        width: 320,
        height: 568,
        scaleText: false,
        reducedMotion: 'reduce',
        forcedColors: 'none',
      },
      {
        name: 'forced-colors-320-reflow',
        width: 320,
        height: 568,
        scaleText: false,
        reducedMotion: 'no-preference',
        forcedColors: 'active',
      },
    ] as const) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: scenario.width, height: scenario.height },
        reducedMotion: scenario.reducedMotion,
        forcedColors: scenario.forcedColors,
      });
      try {
        const page = await context.newPage();
        const requests: string[] = [];
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname;
          if (path.startsWith('/api/')) requests.push(path);
        });
        await page.goto('/?tickers=TICK0001,TICK0002,TICK0003');

        for (const ticker of ['TICK0001', 'TICK0002', 'TICK0003']) {
          await expect(await matrixCell(page, ticker, 'Latest close')).toHaveText(
            /^[\d,]+\.\d{2}$/,
          );
          await expect(await matrixCell(page, ticker, 'Total return')).toHaveText(
            /^[+−-]?\d+\.\d{2}%$/,
          );
        }

        const loaded = [...requests];
        // e2e-locator: Root typography is deliberately scaled in CSS; this is not deviceScaleFactor or a claimed browser zoom setting.
        const documentRoot = page.locator('html');
        if (scenario.scaleText) {
          await expect(documentRoot).toHaveCSS('font-size', '16px');

          await documentRoot.evaluate((element) => {
            element.style.fontSize = '200%';
          });

          await expect(documentRoot).toHaveCSS('font-size', '32px');
        }
        if (scenario.scaleText) {
          const chart = page.getByRole('img', { name: 'Rebased price change', exact: true });
          // e2e-locator: SVG text nodes own the visible glyphs; title children preserve alternate full labels and must not enter this measurement.
          const axisText = chart.locator('text');

          await expect.poll(async () => axisText.count()).toBeGreaterThan(0);

          await expect
            .poll(async () => {
              const svg = await chart.boundingBox();
              if (!svg) return ['The plotted SVG has no bounds.'];
              const labels = await axisText.evaluateAll((elements) =>
                elements.map((element) => {
                  const nodes = [...element.childNodes].filter(
                    (node) => node.nodeType === node.TEXT_NODE && node.textContent?.trim(),
                  );
                  const rectangles = nodes.map((node) => {
                    const range = element.ownerDocument.createRange();
                    range.selectNodeContents(node);
                    const bounds = range.getBoundingClientRect();
                    return {
                      left: bounds.left,
                      right: bounds.right,
                      top: bounds.top,
                      bottom: bounds.bottom,
                    };
                  });
                  return {
                    text: nodes
                      .map((node) => node.textContent)
                      .join('')
                      .trim(),
                    axis: element.parentElement?.getAttribute('aria-label') ?? 'Axis label',
                    fontSize: element.ownerDocument.defaultView?.getComputedStyle(element).fontSize,
                    left: Math.min(...rectangles.map((bounds) => bounds.left)),
                    right: Math.max(...rectangles.map((bounds) => bounds.right)),
                    top: Math.min(...rectangles.map((bounds) => bounds.top)),
                    bottom: Math.max(...rectangles.map((bounds) => bounds.bottom)),
                  };
                }),
              );
              const problems: string[] = [];
              for (const axis of ['UTC time axis', 'Value axis']) {
                if (!labels.some((label) => label.axis === axis && label.text))
                  problems.push(`${axis} has no rendered tick labels.`);
              }
              for (const text of ['Price change (%)', 'Date (UTC)']) {
                if (!labels.some((label) => label.axis === 'Axis label' && label.text === text))
                  problems.push(`Missing visible axis label: ${text}`);
              }
              for (const label of labels) {
                if (label.fontSize !== '24px')
                  problems.push(
                    `${label.text}: expected the actual enlarged24px axis text, got ${label.fontSize}.`,
                  );
                if (!label.text || label.right <= label.left || label.bottom <= label.top)
                  problems.push(`${label.text}: missing rendered text bounds.`);
                // Half a CSS pixel accounts only for fractional glyph-bound rounding at the SVG edge.
                if (
                  label.left < svg.x - 0.5 ||
                  label.right > svg.x + svg.width + 0.5 ||
                  label.top < svg.y - 0.5 ||
                  label.bottom > svg.y + svg.height + 0.5
                )
                  problems.push(`${label.text}: clipped outside its SVG.`);
              }
              for (const [index, label] of labels.entries()) {
                for (const other of labels.slice(index + 1)) {
                  if (
                    label.left < other.right &&
                    other.left < label.right &&
                    label.top < other.bottom &&
                    other.top < label.bottom
                  )
                    problems.push(`${label.text} overlaps ${other.text}.`);
                }
              }
              return problems;
            })
            .toEqual([]);
        }
        const preferences = await documentRoot.evaluate((element) => ({
          reducedMotion: element.ownerDocument.defaultView?.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches,
          forcedColors:
            element.ownerDocument.defaultView?.matchMedia('(forced-colors: active)').matches,
        }));

        expect(preferences).toEqual({
          reducedMotion: scenario.reducedMotion === 'reduce',
          forcedColors: scenario.forcedColors === 'active',
        });

        const input = page.getByRole('combobox', { name: 'Compare instruments', exact: true });

        await input.fill('TICK0004');

        await expect(page.getByRole('option', { name: 'TICK0004', exact: true })).toBeDisabled();
        expect((await input.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        await input.press('Escape');

        const matrix = page.getByRole('table', { name: 'Comparison', exact: true });

        await expect(matrix.getByRole('columnheader')).toHaveText([
          'Metric',
          'TICK0001',
          'TICK0002',
          'TICK0003',
        ]);
        await expect(await matrixCell(page, 'TICK0001', 'Total return')).toHaveText('-9.17%');
        expect(await documentRoot.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
          scenario.width,
        );

        await page.screenshot({
          path: testInfo.outputPath(`${scenario.name}-workspace.png`),
          fullPage: true,
        });
        const trigger = page.getByRole('button', { name: 'View data', exact: true });
        await trigger.scrollIntoViewIfNeeded();

        expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        await trigger.press('Enter');

        const dialog = page.getByRole('dialog', { name: 'Raw observations', exact: true });
        const close = dialog.getByRole('button', { name: 'Close', exact: true });

        await expect(close).toBeFocused();
        expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await expect(
          dialog
            .getByRole('table', { name: 'Recorded closing prices', exact: true })
            .getByRole('rowheader'),
        ).toHaveCount(30);

        const bounds = await close.boundingBox();
        if (!bounds) throw new Error('Expected the visible modal dismissal control.');
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(scenario.height);
        expect(await documentRoot.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
          scenario.width,
        );

        await page.screenshot({
          path: testInfo.outputPath(`${scenario.name}-dialog.png`),
          fullPage: false,
        });
        await page.keyboard.press('Escape');

        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        expect(requests).toEqual(loaded);
      } finally {
        await context.close();
      }
    }
  });
});
