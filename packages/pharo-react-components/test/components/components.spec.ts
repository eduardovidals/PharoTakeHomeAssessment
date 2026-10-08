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

test('multiple picker keeps generic unknown tags, filters with native keyboard focus, and recovers from rejection', async ({
  page,
}) => {
  const input = page.getByRole('combobox', { name: 'Plant varieties' });

  await expect(page.getByRole('button', { name: 'Remove Unknown retired' })).toBeVisible();

  await page.getByRole('button', { name: 'Reject next selection' }).click();
  await input.fill('Variety 12');

  const option = page.getByRole('option', { name: 'Variety 12', exact: true });

  await expect(option).toBeVisible();
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await option.getAttribute('id')) ?? '',
  );

  await input.press('Enter');

  await expect(input).toHaveValue('Variety 12');
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  await input.press('Enter');

  await expect(input).toHaveValue('');

  await input.press('Escape');

  await expect(page.getByRole('button', { name: 'Remove Variety 12' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Unknown retired' })).toBeVisible();
  await expect(page.getByTestId('variety-submissions')).toHaveText('Variety submissions: 0');

  await page.getByRole('button', { name: 'Restore shared selection' }).click();

  await expect(page.getByRole('button', { name: 'Remove Unknown shared' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Variety 12' })).toHaveCount(0);
});

test('multiple picker allows removal at its cap and returns focus after the final tag', async ({
  page,
}) => {
  const input = page.getByRole('combobox', { name: 'Plant varieties' });

  for (const name of ['Variety 01', 'Variety 02', 'Variety 03']) {
    if (name === 'Variety 01') {
      await input.scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Show options Plant varieties' }).click();
    }

    await input.fill(name);
    await page.getByRole('option', { name, exact: true }).click();

    await expect(input).toHaveValue('');
  }

  await expect(page.getByRole('option', { name: 'Variety 04', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(input).toBeEnabled();
  await expect(input).toHaveAccessibleDescription(/4\/4.*Selection limit/);

  await input.press('Escape');

  for (const name of ['Unknown retired', 'Variety 01', 'Variety 02', 'Variety 03']) {
    await page.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
  }

  await expect(input).toBeFocused();
  await expect(input).toHaveAccessibleDescription(/0\/4/);
});

test('multiple picker keeps all 24 choices reachable in bounded desktop and mobile popovers', async ({
  page,
}, testInfo) => {
  const input = page.getByRole('combobox', { name: 'Plant varieties' });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 360, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await input.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Show options Plant varieties' }).click();

    const list = page.getByRole('listbox', { name: 'Plant varieties' });

    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveCount(24);
    await expect(page.getByRole('combobox', { name: 'Plant varieties' })).toHaveCount(1);

    const size = await input.boundingBox();

    expect(size?.height).toBeGreaterThanOrEqual(44);
    expect(await input.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');

    const last = list.getByRole('option', { name: 'Variety 24', exact: true });

    await last.scrollIntoViewIfNeeded();

    await expect(last).toBeInViewport();

    const bounds = await list.boundingBox();

    if (!bounds) throw new Error('The open list has no layout box.');

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.screenshot({ path: testInfo.outputPath(`multiple-picker-${viewport.width}.png`) });
    await input.press('Escape');
  }

  await page.getByRole('button', { name: 'Show options Plant varieties' }).click();

  const final = page.getByRole('option', { name: 'Variety 24', exact: true });

  await final.scrollIntoViewIfNeeded();
  await final.click();
  await input.press('Escape');

  await expect(page.getByRole('button', { name: 'Remove Variety 24' })).toBeVisible();
});

const packageDirectory = fileURLToPath(new URL('../../', import.meta.url));
const repositoryDirectory = path.resolve(packageDirectory, '../..');

const marker = `PHARO_COMPONENT_PRIVATE_${randomUUID()}`;

const pageFailures = new WeakMap<Page, string[]>();

let fixture: string | undefined;
let identity: { dev: number; ino: number } | undefined;
let server: PreviewServer | undefined;
let origin = '';
let failed = false;

test.beforeAll(async () => {
  try {
    const cache = path.join(repositoryDirectory, 'node_modules/.cache');

    await mkdir(cache, { recursive: true });
    fixture = await mkdtemp(path.join(cache, 'pharo-components-'));
    identity = await lstat(fixture);
    await cp(path.join(packageDirectory, 'test/fixture'), fixture, { recursive: true });

    // This consumer resolves real package exports from only their public build files.
    const installedComponents = path.join(fixture, 'node_modules/@pharo/react-components');
    const installedTheme = path.join(fixture, 'node_modules/@pharo/tailwind-plugin');

    await mkdir(installedComponents, { recursive: true });
    await mkdir(installedTheme, { recursive: true });
    await cp(
      path.join(packageDirectory, 'package.json'),
      path.join(installedComponents, 'package.json'),
    );
    await cp(path.join(packageDirectory, 'dist'), path.join(installedComponents, 'dist'), {
      recursive: true,
    });

    for (const file of ['package.json', 'index.css']) {
      await cp(
        path.join(repositoryDirectory, 'packages/pharo-tailwind-plugin', file),
        path.join(installedTheme, file),
      );
    }

    await mkdir(path.join(fixture, '.dev-private'));
    await writeFile(path.join(fixture, '.dev-private/sentinel.txt'), marker);
    await writeFile(path.join(fixture, '.dev-private/hidden.tsx'), '<div className="z-[19138]" />');

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
    const cssFiles = (await readdir(assets)).filter((file) => file.endsWith('.css'));

    expect(cssFiles).toHaveLength(1);

    for (const file of await readdir(assets)) {
      const source = await readFile(path.join(assets, file), 'utf8');

      expect(source).not.toContain(marker);
      expect(source).not.toContain('.dev-private/');
      expect(source).not.toContain('19138');
      expect(file).not.toMatch(/\.map$/);
    }

    server = await preview({
      root: fixture,
      configFile: false,
      envDir: false,
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });

    const address = server.httpServer.address();

    if (!address || typeof address === 'string')
      throw new Error('Component preview did not bind a port.');

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

    if (url.origin !== origin || /\.(?:dev-private|private|reference)\//.test(url.pathname))
      failures.push(`Unexpected page request: ${request.url()}`);
  });
  await page.goto(origin);

  await expect(
    page.getByRole('heading', { name: 'Accessible controls, composed together' }),
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
      )
        throw new Error('Component fixture directory ownership changed.');

      await rm(fixture, { recursive: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      failures.push(error);
    }
  }

  if (fixture && (failed || failures.length > 0))
    console.info(`Preserved component fixture: ${fixture}`);

  if (failures.length > 0) throw new AggregateError(failures, 'Component fixture cleanup failed.');
});

test.describe('Use the built Pharo components without application providers', () => {
  test('public exports retain theme typography, consumer overrides, and accessible progress', async ({
    page,
  }, testInfo) => {
    const action = page.getByRole('button', { name: 'Save changes', exact: true });

    await expect(action).toHaveCSS('background-color', 'rgb(0, 61, 135)');
    await expect(action).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(action).toHaveCSS('font-size', '16px');
    await expect(action).toHaveCSS('min-height', '44px');

    const small = page.getByRole('button', { name: 'Small custom action' });

    await expect(small).toHaveCSS('font-size', '14px');
    await expect(small).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(small).toHaveCSS('padding-inline-start', '32px');
    await expect(small).toHaveCSS('padding-inline-end', '32px');
    await expect(small).toHaveCSS('border-radius', '9999px');
    await expect(small).toHaveCSS('min-height', '44px');

    const progress = page.getByRole('progressbar', { name: 'Updating preferences' });

    await expect(progress).not.toHaveAttribute('aria-valuenow');
    // e2e-locator: The decorative ring has no accessible role; inspect its rendered size.
    await expect(progress.locator('[aria-hidden="true"]')).toHaveCSS('width', '24px');
    // e2e-locator: Inspect the decorative small ring inside its semantically named progressbar.
    await expect(
      page.getByRole('progressbar', { name: 'Loading preview' }).locator('[aria-hidden="true"]'),
    ).toHaveCSS('width', '16px');

    await page.screenshot({ path: testInfo.outputPath('components-default.png'), fullPage: true });
  });

  test('keyboard, hover, pressed, pending, and disabled actions retain actual React Aria behavior', async ({
    page,
  }, testInfo) => {
    const action = page.getByRole('button', { name: 'Save changes', exact: true });

    await page.keyboard.press('Tab');

    await expect(action).toBeFocused();
    await expect(action).toHaveCSS('outline-width', '3px');
    await expect(action).toHaveCSS('outline-color', 'rgb(0, 111, 166)');

    await page.keyboard.press('Enter');

    await expect(page.getByRole('region', { name: 'Actions' }).getByRole('status')).toHaveText(
      'Saved 1 times',
    );

    await page.keyboard.press('Tab');

    await expect(page.getByRole('button', { name: 'Secondary action' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Unavailable' })).toBeDisabled();

    await action.hover();

    await expect(action).toHaveCSS('background-color', 'rgb(0, 50, 110)');

    await page.mouse.down();

    await expect(action).toHaveCSS('background-color', 'rgb(0, 33, 127)');

    await page.mouse.up();

    await expect(page.getByRole('button', { name: 'Saving changes' })).toHaveAttribute(
      'data-pending',
      'true',
    );

    await page.emulateMedia({ forcedColors: 'active' });
    await page.keyboard.press('Tab');

    await expect(page.getByRole('button', { name: 'Secondary action' })).toHaveCSS(
      'outline-width',
      '3px',
    );

    await page.screenshot({ path: testInfo.outputPath('components-focus.png'), fullPage: true });
  });

  test('retained controls fit a narrow viewport and reduced motion keeps progress visible', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 800 });

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCSS(
      'transition-duration',
      '0s',
    );

    // e2e-locator: The aria-hidden ring owns the animation; its named progressbar remains semantic.
    const ring = page
      .getByRole('progressbar', { name: 'Updating preferences' })
      .locator('[aria-hidden="true"]');

    await expect(ring).toHaveCSS('animation-name', 'none');
    await expect(ring).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('components-mobile.png'), fullPage: true });
  });

  test('the dialog contains keyboard focus and restores its trigger and background scroll', async ({
    page,
  }, testInfo) => {
    const trigger = page.getByRole('button', { name: 'View collection details' });

    await trigger.scrollIntoViewIfNeeded();

    const before = await page.evaluate(() => ({
      scroll: window.scrollY,
      height: document.documentElement.scrollHeight,
    }));

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Collection details' });
    const close = dialog.getByRole('button', { name: 'Close' });

    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();

    const bounds = await dialog.boundingBox();

    if (!bounds) throw new Error('Dialog has no layout bounds.');

    expect(bounds.width).toBe(896);

    await page.mouse.move(4, 4);
    await page.mouse.wheel(0, -600);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.scroll);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before.height);

    await page.screenshot({ path: testInfo.outputPath('components-dialog-desktop.png') });
    await page.keyboard.press('Shift+Tab');

    await expect(dialog.getByRole('button', { name: 'Last content action' })).toBeFocused();

    await page.keyboard.press('Tab');

    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.scroll);
  });

  test('the short mobile dialog scrolls its content while Close remains visible', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 400 });

    const trigger = page.getByRole('button', { name: 'View collection details' });

    await trigger.scrollIntoViewIfNeeded();

    const before = await page.evaluate(() => window.scrollY);

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Collection details' });
    const close = dialog.getByRole('button', { name: 'Close' });

    await expect(close).toBeVisible();

    // e2e-locator: The dialog's final direct child owns content scrolling, below its fixed header.
    const content = dialog.locator(':scope > div').last();

    expect(await content.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
      await content.evaluate((element) => element.clientHeight),
    );

    await dialog.getByRole('button', { name: 'Last content action' }).scrollIntoViewIfNeeded();

    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    const closeBounds = await close.boundingBox();

    if (!closeBounds) throw new Error('Dialog close action has no layout bounds.');

    expect(closeBounds.y).toBeGreaterThanOrEqual(0);
    expect(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(400);
    expect(closeBounds.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

    await page.screenshot({ path: testInfo.outputPath('components-dialog-mobile.png') });
    await close.click();

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('exclusive choices use arrows to focus and Enter or Space to select, skipping disabled options', async ({
    page,
  }, testInfo) => {
    const group = page.getByRole('radiogroup', { name: 'Collection layout' });
    const list = group.getByRole('radio', { name: 'List', exact: true });
    const grid = group.getByRole('radio', { name: 'Grid', exact: true });

    await group.scrollIntoViewIfNeeded();
    await list.focus();
    await list.press('ArrowRight');

    await expect(grid).toBeFocused();
    await expect(list).toBeChecked();

    await grid.press('Enter');

    await expect(grid).toBeChecked();
    await expect(list).not.toBeChecked();
    await expect(group.getByRole('radio', { name: 'Map', exact: true })).toBeDisabled();
    await expect(page.getByText('Current layout: grid', { exact: true })).toBeVisible();

    await expect(grid).toHaveCSS('min-height', '44px');
    await expect(grid).toHaveCSS('outline-width', '3px');

    await page.emulateMedia({ forcedColors: 'active' });

    await expect(grid).toHaveCSS('forced-color-adjust', 'none');

    await page.screenshot({ path: testInfo.outputPath('components-segmented-focus.png') });
    await grid.press('ArrowLeft');

    await expect(list).toBeFocused();
    await expect(grid).toBeChecked();

    await list.press('Space');

    await expect(list).toBeChecked();
    await expect(grid).not.toBeChecked();

    await list.click();

    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(list).toBeChecked();
  });

  test('the built consumer does not expose private fixture bytes', async ({ request }) => {
    if (!fixture) throw new Error('Component fixture is unavailable.');

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
