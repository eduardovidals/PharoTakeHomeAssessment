import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import type { PreviewServer } from 'vite';

const packageDirectory = fileURLToPath(new URL('../../', import.meta.url));
const repositoryDirectory = path.resolve(packageDirectory, '../..');
const marker = `PHARO_CHART_PRIVATE_${randomUUID()}`;
const pageFailures = new WeakMap<Page, string[]>();
const servers: PreviewServer[] = [];
let fixture: string | undefined;
let identity: { dev: number; ino: number } | undefined;
let origin = '';
let catalogOrigin = '';
let failed = false;

function serverOrigin(server: PreviewServer): string {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Chart preview did not bind a port.');
  return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
  try {
    const cache = path.join(repositoryDirectory, 'node_modules/.cache');
    await mkdir(cache, { recursive: true });
    fixture = await mkdtemp(path.join(cache, 'pharo-charts-'));
    identity = await lstat(fixture);
    await cp(path.join(packageDirectory, 'test/fixture'), fixture, { recursive: true });
    // Resolve public export maps from real manifests and build bytes, with no source alias.
    for (const name of ['react-charts']) {
      const source = path.join(repositoryDirectory, `packages/pharo-${name}`);
      const installed = path.join(fixture, `node_modules/@pharo/${name}`);
      await mkdir(installed, { recursive: true });
      await cp(path.join(source, 'package.json'), path.join(installed, 'package.json'));
      await cp(path.join(source, 'dist'), path.join(installed, 'dist'), { recursive: true });
    }
    const installedTheme = path.join(fixture, 'node_modules/@pharo/tailwind-plugin');
    await mkdir(installedTheme, { recursive: true });
    for (const file of ['package.json', 'index.css']) {
      await cp(
        path.join(repositoryDirectory, 'packages/pharo-tailwind-plugin', file),
        path.join(installedTheme, file),
      );
    }
    await mkdir(path.join(fixture, '.dev-private'));
    await writeFile(path.join(fixture, '.dev-private/sentinel.txt'), marker);
    await writeFile(path.join(fixture, '.dev-private/hidden.tsx'), '<div className="z-[19149]" />');
    await build({
      root: fixture,
      configFile: false,
      envDir: false,
      cacheDir: path.join(fixture, '.vite'),
      plugins: [react(), tailwindcss()],
      resolve: { dedupe: ['react', 'react-dom'] },
      logLevel: 'warn',
      build: { outDir: 'dist', sourcemap: false, minify: false },
    });
    const assets = path.join(fixture, 'dist/assets');
    expect((await readdir(assets)).filter((file) => file.endsWith('.css'))).toHaveLength(1);
    for (const file of await readdir(assets)) {
      const source = await readFile(path.join(assets, file), 'utf8');
      expect(source).not.toContain(marker);
      expect(source).not.toContain('.dev-private/');
      expect(source).not.toContain('19149');
      expect(file).not.toMatch(/\.map$/);
    }
    const consumer = await preview({
      root: fixture,
      configFile: false,
      envDir: false,
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    servers.push(consumer);
    origin = serverOrigin(consumer);

    // A missing or empty catalog is a failure; this serves the actual Nx-built catalog.
    const catalogIndex = await readFile(
      path.join(packageDirectory, 'storybook-static/index.json'),
      'utf8',
    );
    expect(catalogIndex).toContain('charts-pharolinechart--docs');
    const catalog = await preview({
      root: packageDirectory,
      configFile: false,
      envDir: false,
      logLevel: 'silent',
      build: { outDir: 'storybook-static' },
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    servers.push(catalog);
    catalogOrigin = serverOrigin(catalog);
  } catch (error) {
    failed = true;
    throw error;
  }
});

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  pageFailures.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ![origin, catalogOrigin].includes(url.origin) ||
      /\.(?:dev-private|private|reference)\//.test(url.pathname)
    )
      failures.push(`Unexpected page request: ${request.url()}`);
  });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Independent responsive charts' })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) failed = true;
  const errors = pageFailures.get(page) ?? [];
  if (errors.length > 0) failed = true;
  expect(errors).toEqual([]);
});

test.afterAll(async () => {
  const failures: unknown[] = [];
  for (const server of [...servers].reverse()) {
    try {
      await server.close();
    } catch (error) {
      failed = true;
      failures.push(error);
    }
  }
  if (fixture && !failed) {
    try {
      const current = await lstat(fixture);
      if (
        !identity ||
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino
      )
        throw new Error('Chart fixture directory ownership changed.');
      await rm(fixture, { recursive: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (fixture && (failed || failures.length > 0))
    console.info(`Preserved chart fixture: ${fixture}`);
  if (failures.length > 0) throw new AggregateError(failures, 'Chart fixture cleanup failed.');
});

test.describe('independent built charts', () => {
  test('two instances have distinct SVG ownership and respond to independent resizing', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const first = page.getByRole('img', { name: 'Greenhouse temperature', exact: true });
    const second = page.getByRole('img', { name: 'Sample levels', exact: true });
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(first).toHaveAttribute('height', '320');
    await expect(second).toHaveAttribute('height', '320');
    const firstWidth = Number(await first.getAttribute('width'));
    const secondWidth = Number(await second.getAttribute('width'));
    expect(firstWidth).toBeGreaterThan(256);
    // e2e-locator: SVG clip ownership and numerical paths have no separate accessible role.
    const firstClip = await first.locator('clipPath').getAttribute('id');
    // e2e-locator: Compare actual clip resources across independently mounted SVG roots.
    const secondClip = await second.locator('clipPath').getAttribute('id');
    expect(firstClip).toBeTruthy();
    expect(secondClip).toBeTruthy();
    expect(firstClip).not.toBe(secondClip);
    expect(await first.getAttribute('aria-labelledby')).not.toBe(
      await second.getAttribute('aria-labelledby'),
    );
    // e2e-locator: Inspect the real rendered path for a named series, not React state.
    const northPath = first.locator('[data-series-id="north"] path');
    const initialPath = await northPath.getAttribute('d');
    await page.getByRole('button', { name: 'Resize first chart' }).click();
    await expect(first).toHaveAttribute('width', '256');
    // e2e-locator: Actual SVG text rectangles reveal overlapping axis labels after resize.
    await expect
      .poll(() =>
        first.locator('g[aria-label="UTC time axis"] text').evaluateAll((elements) => {
          const bounds = elements.map((element) => element.getBoundingClientRect());
          return bounds.every((current, index) => {
            const previous = bounds[index - 1];
            return !previous || current.left >= previous.right + 4;
          });
        }),
      )
      .toBe(true);
    await expect(northPath).not.toHaveAttribute('d', initialPath ?? '');
    await expect(second).toHaveAttribute('width', String(secondWidth));
    await page.getByRole('button', { name: 'Resize first height' }).click();
    await expect(first).toHaveAttribute('height', '384');
    await expect(second).toHaveAttribute('height', '320');
    expect(await first.evaluate((element) => element.getBoundingClientRect().height)).toBe(384);
    await page.getByRole('button', { name: 'Resize first height' }).click();
    await expect(first).toHaveAttribute('height', '320');
    expect(await first.evaluate((element) => element.getBoundingClientRect().height)).toBe(320);
    expect(await first.evaluate((element) => element.outerHTML)).not.toMatch(/NaN|Infinity/);
    await page.getByRole('button', { name: 'Resize first chart' }).click();
    await expect(first).toHaveAttribute('width', String(firstWidth));
    await page.screenshot({ path: testInfo.outputPath('charts-desktop.png'), fullPage: true });
    for (const width of [768, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await expect
        .poll(() => first.evaluate((element) => element.getBoundingClientRect().right))
        .toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await first.evaluate((element) => element.outerHTML)).not.toMatch(/NaN|Infinity/);
    }
    await page.screenshot({ path: testInfo.outputPath('charts-narrow.png'), fullPage: true });
  });

  test('an active series retains its actual stroke and dash when others change', async ({
    page,
  }) => {
    const chart = page.getByRole('img', { name: 'Greenhouse temperature', exact: true });
    // e2e-locator: Computed line styles prove rendered semantic series identity.
    const southPath = chart.locator('[data-series-id="south"] path');
    await expect(southPath).toBeVisible();
    const style = await southPath.evaluate((element) => ({
      stroke: getComputedStyle(element).stroke,
      dash: getComputedStyle(element).strokeDasharray,
    }));
    expect(style.stroke).toBe('rgb(0, 122, 155)');
    expect(style.dash).not.toBe('none');
    await page.getByRole('button', { name: 'Remove north' }).click();
    await page.getByRole('button', { name: 'Add east' }).click();
    await page.getByRole('button', { name: 'Reverse series' }).click();
    await expect
      .poll(() =>
        southPath.evaluate((element) => ({
          stroke: getComputedStyle(element).stroke,
          dash: getComputedStyle(element).strokeDasharray,
        })),
      )
      .toEqual(style);
    // e2e-locator: Verify the other rendered series has its own noncolliding appearance.
    const eastPath = chart.locator('[data-series-id="east"] path');
    await expect(eastPath).toBeVisible();
    expect(await eastPath.evaluate((element) => getComputedStyle(element).stroke)).not.toBe(
      style.stroke,
    );
  });

  test('missing values break paths and isolated observations remain visible', async ({ page }) => {
    const chart = page.getByRole('img', { name: 'Missing measurements', exact: true });
    await chart.scrollIntoViewIfNeeded();
    // e2e-locator: Path commands and marker geometry are the actual missing-value output.
    const group = chart.locator('[data-series-id="gapped"]');
    // e2e-locator: A null midpoint must create two subpaths rather than a connecting segment.
    const geometry = await group.locator('path').getAttribute('d');
    expect(geometry?.match(/M/g)).toHaveLength(2);
    expect(geometry).not.toContain('L');
    // e2e-locator: Isolated SVG observations need real visible circle marks.
    const markers = group.locator('circle');
    await expect(markers).toHaveCount(2);
    for (const marker of await markers.all()) {
      await expect(marker).toBeVisible();
      expect(Number(await marker.getAttribute('r'))).toBeGreaterThan(0);
      expect(await marker.evaluate((element) => getComputedStyle(element).fill)).not.toBe('none');
    }
  });

  test('empty and malformed input have readable states without fabricated charts', async ({
    page,
  }) => {
    const empty = page.getByRole('region', { name: 'Empty example', exact: true });
    const invalid = page.getByRole('region', { name: 'Invalid example', exact: true });
    await expect(empty.getByRole('status', { name: 'Empty measurements' })).toBeVisible();
    await expect(invalid.getByRole('status', { name: 'Invalid measurements' })).toBeVisible();
    await expect(empty.getByRole('img')).toHaveCount(0);
    await expect(invalid.getByRole('img')).toHaveCount(0);
    await expect(empty.getByRole('status')).not.toBeEmpty();
    await expect(invalid.getByRole('status')).not.toBeEmpty();
  });

  test('UTC tick dates agree in New York and Tokyo across daylight saving time', async ({
    browser,
  }) => {
    const observations: string[][] = [];
    for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
      const context = await browser.newContext({ timezoneId });
      const errors: string[] = [];
      try {
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin);
        const chart = page.getByRole('img', { name: 'Greenhouse temperature', exact: true });
        await expect(chart).toBeVisible();
        // e2e-locator: Verify visible SVG text, not its correctly hidden full-value title child.
        const dateLabels = chart.locator('g[aria-label="UTC time axis"] text');
        await expect(dateLabels.filter({ hasText: '2024-03-10' })).toBeVisible();
        await expect(dateLabels.filter({ hasText: '2024-03-12' })).toBeVisible();
        // e2e-locator: Read actual SVG axis text to compare timezone-independent labels.
        observations.push(await chart.locator('text').allTextContents());
        const slider = page.getByRole('slider', { name: 'Inspect Greenhouse temperature' });
        await slider.press('End');
        await expect(slider).toHaveAttribute('aria-valuetext', /2024-03-12/);
        const details = page.getByRole('region', { name: 'Details for Greenhouse temperature' });
        await expect(details).toContainText('2024-03-12');
        await page
          .getByRole('button', { name: 'Show data table for Greenhouse temperature' })
          .click();
        const table = page.getByRole('table', { name: 'Data for Greenhouse temperature' });
        await expect(table.getByRole('rowheader')).toHaveText([
          '2024-03-10',
          '2024-03-11',
          '2024-03-12',
        ]);
        observations.push(await table.getByRole('rowheader').allTextContents());
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
    expect(observations[0]).toEqual(observations[2]);
    expect(observations[1]).toEqual(observations[3]);
  });

  test('native keyboard inspection reaches recorded dates, exposes gaps and exits by Tab', async ({
    page,
  }, testInfo) => {
    const slider = page.getByRole('slider', { name: 'Inspect Unequal calendar measurements' });
    const details = page.getByRole('region', { name: 'Details for Unequal calendar measurements' });
    const other = page.getByRole('region', { name: 'Details for Greenhouse temperature' });
    await expect(slider).toHaveAttribute('min', '0');
    await expect(slider).toHaveAttribute('max', '3');
    await expect(slider).toHaveAttribute('step', '1');
    await slider.press('Home');
    await expect(slider).toBeFocused();
    await expect(slider).toHaveValue('0');
    await expect(details).toContainText('2024-03-10');
    await expect(details.getByText('2', { exact: true })).toBeVisible();
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
    const focus = await slider.evaluate((element) => ({
      style: getComputedStyle(element).outlineStyle,
      width: getComputedStyle(element).outlineWidth,
      color: getComputedStyle(element).outlineColor,
    }));
    expect(focus).toEqual({ style: 'solid', width: '3px', color: 'rgb(0, 111, 166)' });
    await slider.press('ArrowLeft');
    await expect(slider).toHaveValue('0');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('1');
    await expect(slider).toHaveAttribute('aria-valuetext', /2024-03-11.*Unavailable.*20/);
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(details.getByText('20', { exact: true })).toBeVisible();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('2');
    await expect(details).toContainText('2024-03-12');
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(details.getByText('30', { exact: true })).toBeVisible();
    await slider.press('End');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('3');
    await expect(details).toContainText('2024-03-13');
    await expect(details.getByText('8', { exact: true })).toBeVisible();
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(other).toContainText('2024-03-10');
    await page.screenshot({
      path: testInfo.outputPath('charts-keyboard-focus.png'),
      fullPage: true,
    });
    await slider.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Show data table for Unequal calendar measurements' }),
    ).toBeFocused();
    await expect(page.getByRole('application')).toHaveCount(0);
  });

  test('pointer inspection maps the actual resized SVG to recorded values without interpolation', async ({
    page,
  }) => {
    const chart = page.getByRole('img', { name: 'Unequal calendar measurements', exact: true });
    const details = page.getByRole('region', { name: 'Details for Unequal calendar measurements' });
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await chart.scrollIntoViewIfNeeded();
      await expect
        .poll(() => chart.evaluate((element) => element.getBoundingClientRect().right))
        .toBeLessThanOrEqual(width);
      const box = await chart.boundingBox();
      if (!box) throw new Error('The visible inspection chart has no browser rectangle.');
      const viewWidth = Number(await chart.getAttribute('width'));
      const left = box.x + (56 / viewWidth) * box.width;
      const span = ((viewWidth - 72) / viewWidth) * box.width;
      const y = box.y + box.height / 2;
      await page.mouse.move(left - 4, y);
      await expect(details).toContainText('2024-03-10');
      await expect(details.getByText('2', { exact: true })).toBeVisible();
      await page.mouse.move(left + span / 3, y);
      await expect(details).toContainText('2024-03-11');
      await expect(details.getByText('20', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
      await page.mouse.move(left + (2 * span) / 3, y);
      await expect(details).toContainText('2024-03-12');
      await expect(details.getByText('30', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
      await page.mouse.move(left + span + 4, y);
      await expect(details).toContainText('2024-03-13');
      await expect(details.getByText('8', { exact: true })).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(details).toContainText('2024-03-13');
    }
  });

  test('full data stays readable at narrow widths without changing measured chart height', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const chart = page.getByRole('img', { name: 'Unequal calendar measurements', exact: true });
    const button = page.getByRole('button', {
      name: 'Show data table for Unequal calendar measurements',
    });
    await expect(chart).toHaveAttribute('height', '320');
    await button.click();
    await expect(button).toHaveCount(0);
    const hide = page.getByRole('button', {
      name: 'Hide data table for Unequal calendar measurements',
    });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    const table = page.getByRole('table', { name: 'Data for Unequal calendar measurements' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Date (UTC)',
      'Northern greenhouse with a long sensor label for narrow screens',
      'Southern greenhouse with a different recording calendar',
    ]);
    await expect(table.getByRole('rowheader')).toHaveText([
      '2024-03-10',
      '2024-03-11',
      '2024-03-12',
      '2024-03-13',
    ]);
    await expect(table.getByRole('cell')).toHaveText([
      '2',
      'Unavailable',
      'Unavailable',
      '20',
      'Unavailable',
      '30',
      '8',
      'Unavailable',
    ]);
    const scroll = await table.evaluate((element) => {
      const parent = element.parentElement;
      if (!parent) throw new Error('Table scroll container is absent.');
      return {
        overflow: getComputedStyle(parent).overflowX,
        width: parent.clientWidth,
        content: parent.scrollWidth,
        tabIndex: parent.tabIndex,
      };
    });
    expect(['auto', 'scroll']).toContain(scroll.overflow);
    expect(scroll.tabIndex).toBe(0);
    expect(scroll.content).toBeGreaterThan(scroll.width);
    await hide.press('Tab');
    const tableRegion = page.getByRole('region', {
      name: 'Data table for Unequal calendar measurements',
    });
    await expect(tableRegion).toBeFocused();
    const initialScroll = await tableRegion.evaluate((element) => element.scrollLeft);
    await tableRegion.press('ArrowRight');
    await expect
      .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(initialScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(chart).toHaveAttribute('height', '320');
    expect(await chart.evaluate((element) => element.getBoundingClientRect().height)).toBe(320);
    await page.screenshot({ path: testInfo.outputPath('charts-narrow-table.png'), fullPage: true });
    await hide.click();
    await expect(table).not.toBeVisible();
    await expect(chart).toHaveAttribute('height', '320');
    await page
      .getByRole('button', { name: 'Show data table for Custom formatted measurements' })
      .click();
    const formatted = page.getByRole('table', { name: 'Data for Custom formatted measurements' });
    await expect(formatted.getByRole('rowheader')).toHaveText(
      'Recorded on 2024-03-10 at midnight Coordinated Universal Time',
    );
    await expect(formatted.getByRole('cell')).toHaveText(
      'Reading 123456789.12345679 in fully described measurement units',
    );
    for (const cell of [formatted.getByRole('rowheader'), formatted.getByRole('cell')]) {
      expect(
        await cell.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          return Array.from(range.getClientRects()).every(
            (line) => line.left >= bounds.left && line.right <= bounds.right,
          );
        }),
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('charts-narrow-custom-formats.png'),
      fullPage: true,
    });
  });

  test('mobile touch selects a recorded date and a vertical gesture remains page scrolling', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 320, height: 720 },
      isMobile: true,
      hasTouch: true,
    });
    const errors: string[] = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      const chart = page.getByRole('img', { name: 'Unequal calendar measurements', exact: true });
      const details = page.getByRole('region', {
        name: 'Details for Unequal calendar measurements',
      });
      await chart.scrollIntoViewIfNeeded();
      let box = await chart.boundingBox();
      if (!box) throw new Error('Touch chart has no visible rectangle.');
      const viewWidth = Number(await chart.getAttribute('width'));
      const secondDateX = box.x + ((56 + (viewWidth - 72) / 3) / viewWidth) * box.width;
      await page.touchscreen.tap(secondDateX, box.y + box.height / 2);
      await expect(details).toContainText('2024-03-11');
      await expect(details.getByText('20', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
      await chart.scrollIntoViewIfNeeded();
      box = await chart.boundingBox();
      if (!box) throw new Error('Touch chart disappeared before the scroll gesture.');
      const x = box.x + box.width - 20;
      const y = box.y + box.height / 2;
      const before = await page.evaluate(() => scrollY);
      const session = await context.newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - 35 }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - 100 }],
        });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
        await expect(details).toContainText('2024-03-11');
      } finally {
        await session.detach();
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('compiled chart Docs expose the actual generic public contract', async ({
    page,
  }, testInfo) => {
    await page.goto(`${catalogOrigin}/iframe.html?id=charts-pharolinechart--docs&viewMode=docs`);
    await expect(page.getByRole('heading', { name: 'PharoLineChart', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^label\*?$/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^series\*?$/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^formatX$/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('charts-catalog-docs.png'), fullPage: true });
  });

  test('compiled and served output excludes private sentinel bytes', async ({ request }) => {
    if (!fixture) throw new Error('Chart fixture is unavailable.');
    const absolute = fixture.split(path.sep).map(encodeURIComponent).join('/');
    for (const url of ['/.dev-private/sentinel.txt', `/@fs${absolute}/.dev-private/sentinel.txt`]) {
      const response = await request.get(origin + url);
      expect(await response.text()).not.toContain(marker);
      expect([200, 403, 404]).toContain(response.status());
      if (response.status() === 200)
        expect(response.headers()['content-type']).toContain('text/html');
    }
  });
});
