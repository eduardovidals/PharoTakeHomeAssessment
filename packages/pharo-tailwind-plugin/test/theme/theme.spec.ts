import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import type { PreviewServer } from 'vite';

const packageDirectory = fileURLToPath(new URL('../../', import.meta.url));
const repositoryDirectory = path.resolve(packageDirectory, '../..');
const marker = `PHARO_THEME_PRIVATE_${randomUUID()}`;
const pageFailures = new WeakMap<Page, string[]>();
let fixture: string | undefined;
let identity: { dev: number; ino: number } | undefined;
let server: PreviewServer | undefined;
let origin = '';
let compiledCss = '';
let failed = false;

test.beforeAll(async () => {
  try {
    const cache = path.join(repositoryDirectory, 'node_modules/.cache');
    await mkdir(cache, { recursive: true });
    fixture = await mkdtemp(path.join(cache, 'pharo-theme-'));
    identity = await lstat(fixture);
    await cp(path.join(packageDirectory, 'test/fixture'), fixture, { recursive: true });
    const installedPackage = path.join(fixture, 'node_modules/@pharo/tailwind-plugin');
    await mkdir(installedPackage, { recursive: true });
    // Copy only the package manifest and its exported CSS, with no workspace source alias.
    for (const file of ['package.json', 'index.css']) {
      await cp(path.join(packageDirectory, file), path.join(installedPackage, file));
    }
    const dependencyProbe = path.join(fixture, 'node_modules/@pharo/react-components/dist');
    await mkdir(dependencyProbe, { recursive: true });
    // Generated source-discovery data only; this does not stand in for a real UI component.
    await writeFile(
      path.join(dependencyProbe, 'scan-probe.js'),
      '// Consumer dependency scanning probe.\nexport const className = "mb-pharo-12";\n',
    );
    await mkdir(path.join(fixture, '.dev-private'));
    await writeFile(path.join(fixture, '.dev-private/sentinel.txt'), marker);
    await writeFile(path.join(fixture, '.dev-private/hidden.tsx'), '<div className="z-[19137]" />');

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
    for (const file of await readdir(assets)) {
      const source = await readFile(path.join(assets, file), 'utf8');
      expect(source).not.toContain(marker);
      expect(source).not.toContain('.dev-private/');
      if (file.endsWith('.css')) compiledCss += source;
    }
    expect(compiledCss.length).toBeGreaterThan(0);
    server = await preview({
      root: fixture,
      configFile: false,
      envDir: false,
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Theme preview did not bind a port.');
    origin = `http://127.0.0.1:${address.port}`;
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
    if (url.origin !== origin || /\.(?:dev-private|private|reference)\//.test(url.pathname)) {
      failures.push(`Unexpected page request: ${request.url()}`);
    }
  });
  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'Clear information, deliberate contrast' }),
  ).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) failed = true;
  const errors = pageFailures.get(page) ?? [];
  if (errors.length > 0) failed = true;
  expect(errors).toEqual([]);
});

test.afterAll(async () => {
  const failures: unknown[] = [];
  try {
    await server?.close();
  } catch (error) {
    failed = true;
    failures.push(error);
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
      ) {
        throw new Error('Theme fixture directory ownership changed.');
      }
      await rm(fixture, { recursive: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      failures.push(error);
    }
  }
  if (fixture && (failed || failures.length > 0))
    console.info(`Preserved theme fixture: ${fixture}`);
  if (failures.length > 0) throw new AggregateError(failures, 'Theme fixture cleanup failed.');
});

test.describe('Use the public Pharo theme independently', () => {
  test('the packaged CSS compiles semantic utilities and readable text, controls, and chart lines', async ({
    page,
  }, testInfo) => {
    for (const utility of [
      'bg-pharo-surface',
      'text-pharo-foreground',
      'pharo-focus-ring',
      'pharo-transition-colors',
      'pharo-selected-action',
      'h-pharo-plot-mobile',
      'h-pharo-plot-desktop',
      'max-w-pharo-workspace',
      'max-w-pharo-matrix',
      'max-w-pharo-dialog',
    ]) {
      expect(compiledCss).toContain(utility);
    }
    expect(compiledCss).not.toContain('19137');
    expect(compiledCss).toContain('.mb-pharo-12');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 250)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(23, 36, 58)');
    await expect(page.locator('body')).toHaveCSS('font-family', /system-ui/);
    for (const name of ['foreground', 'muted', 'error', 'success', 'warning']) {
      const style = await colors(page.getByTestId(name));
      expect(contrast(style.foreground, style.background), name).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ['surface', 'quiet', 'selected']) {
      for (const meaning of ['positive', 'negative']) {
        const value = page.getByTestId(`${meaning}-${surface}`);
        const style = await colors(value);
        expect(
          contrast(style.foreground, style.background),
          `${meaning} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
        await expect(value).toContainText(meaning === 'positive' ? '+12.34%' : '−5.67%');
      }
    }
    for (const name of ['Theme action', 'Unavailable action']) {
      const style = await colors(page.getByRole('button', { name, exact: true }));
      expect(contrast(style.foreground, style.background), name).toBeGreaterThanOrEqual(4.5);
    }
    const border = await colors(page.getByTestId('control-border'));
    expect(contrast(border.border, border.background)).toBeGreaterThanOrEqual(3);
    const dashes: string[] = [];
    for (const name of ['chart-1', 'chart-2', 'chart-3']) {
      const line = page.getByTestId(name);
      const style = await line.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { stroke: computed.stroke, dash: computed.strokeDasharray };
      });
      expect(contrast(style.stroke, 'rgb(255, 255, 255)'), name).toBeGreaterThanOrEqual(3);
      dashes.push(style.dash);
    }
    expect(new Set(dashes).size).toBe(3);
    const baseline = await page
      .getByTestId('chart-baseline')
      .evaluate((element) => getComputedStyle(element).stroke);
    const grid = await page
      .getByTestId('chart-grid')
      .evaluate((element) => getComputedStyle(element).stroke);
    expect(contrast(baseline, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(3);
    expect(contrast(grid, 'rgb(255, 255, 255)')).toBeLessThan(
      contrast(baseline, 'rgb(255, 255, 255)'),
    );
    await page.screenshot({ path: testInfo.outputPath('theme-default.png'), fullPage: true });
  });

  test('real React Aria states expose hover, press, disabled, and keyboard focus styles', async ({
    page,
  }, testInfo) => {
    const action = page.getByRole('button', { name: 'Theme action', exact: true });
    const disabled = page.getByRole('button', { name: 'Unavailable action' });
    await expect(action).toHaveCSS('background-color', 'rgb(0, 61, 135)');
    await action.hover();
    await expect(action).toHaveAttribute('data-hovered', 'true');
    await expect(action).toHaveCSS('background-color', 'rgb(0, 50, 110)');
    await page.mouse.down();
    await expect(action).toHaveAttribute('data-pressed', 'true');
    await expect(action).toHaveCSS('background-color', 'rgb(0, 33, 127)');
    await page.mouse.up();
    await disabled.hover();
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS('background-color', 'rgb(229, 235, 242)');
    await expect(disabled).toHaveCSS('color', 'rgb(82, 97, 118)');

    await page.reload();
    await page.keyboard.press('Tab');
    await expect(action).toBeFocused();
    await expect(action).toHaveAttribute('data-focus-visible', 'true');
    await expect(action).toHaveCSS('outline-width', '3px');
    await expect(action).toHaveCSS('outline-offset', '3px');
    const focus = await action.evaluate((element) => getComputedStyle(element).outlineColor);
    expect(contrast(focus, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath('theme-focus.png'), fullPage: true });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Open theme dialog' })).toBeFocused();
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(page.getByRole('button', { name: 'Open theme dialog' })).toHaveCSS(
      'box-shadow',
      'none',
    );
    await expect(page.getByRole('button', { name: 'Open theme dialog' })).toHaveCSS(
      'outline-width',
      '3px',
    );
  });

  test('a real body portal inherits the document theme and font', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Open theme dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Theme portal' });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => document.getElementById('root')?.contains(element)),
    ).toBe(false);
    const text = page.getByTestId('portal-text');
    await expect(text).toHaveCSS('color', 'rgb(23, 36, 58)');
    const bodyFont = await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).fontFamily);
    await expect(text).toHaveCSS('font-family', bodyFont);
    await expect(dialog.locator('..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.screenshot({ path: testInfo.outputPath('theme-portal.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close theme dialog' }).click();
    await expect(dialog).toBeHidden();
  });

  test('reduced-motion disables the theme color transition', async ({ page }) => {
    const action = page.getByRole('button', { name: 'Theme action', exact: true });
    await expect(action).toHaveCSS('transition-duration', '0.12s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(action).toHaveCSS('transition-duration', '0s');
  });

  test('a real selected action keeps a visible selected state in forced colors', async ({
    page,
  }) => {
    const selected = page.getByRole('button', { name: 'Selected view' });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).toHaveCSS('background-color', 'rgb(0, 61, 135)');
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(selected).toHaveCSS('forced-color-adjust', 'none');
    const active = await colors(selected);
    // System Highlight may include transparency; preserve its user-defined pair.
    expect(active.foreground).not.toBe(active.background);
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'false');
    await expect(selected).toHaveCSS('forced-color-adjust', 'auto');
    const inactive = await colors(selected);
    expect(inactive.background).not.toBe(active.background);
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).toHaveCSS('background-color', active.background);
  });

  test('compact roles keep touch inputs readable while only the plot changes responsive height', async ({
    page,
  }) => {
    await expect(page.locator('.max-w-pharo-workspace')).toHaveCSS('max-width', '1440px');
    await expect(page.locator('.max-w-pharo-matrix')).toHaveCSS('max-width', '440px');
    await expect(page.locator('.max-w-pharo-dialog')).toHaveCSS('max-width', '896px');
    const plot = page.getByTestId('responsive-plot');
    const input = page.getByRole('textbox', { name: 'Density input' });
    await expect(plot).toHaveCSS('height', '320px');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(plot).toHaveCSS('height', '256px');
    await expect(input).toHaveCSS('font-size', '16px');
    const dimensions = await input.boundingBox();
    expect(dimensions?.height).toBeGreaterThanOrEqual(44);
    const header = await page.getByTestId('compact-header').boundingBox();
    expect(header?.height).toBeGreaterThanOrEqual(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(plot).toHaveCSS('height', '320px');
  });

  test('the built consumer does not serve private fixture bytes', async ({ request }) => {
    if (!fixture) throw new Error('Theme fixture is unavailable.');
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

async function colors(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      border: style.borderTopColor,
    };
  });
}

function contrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length !== 3)
      throw new Error(`Expected an opaque computed RGB color: ${color}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const [red, green, blue] = linear;
    if (red === undefined || green === undefined || blue === undefined)
      throw new Error('Missing color channels.');
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
