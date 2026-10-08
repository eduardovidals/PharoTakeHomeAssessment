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
    await expect(page.getByRole('status')).toHaveText('Saved 1 times');
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

  test('field ownership preserves editing, descriptions, error focus, and read-only state', async ({
    page,
  }) => {
    const input = page.getByRole('textbox', { name: 'Display name' });
    await input.fill('Grace Hopper');
    await expect(input).toHaveValue('Grace Hopper');
    await expect(input).toHaveAttribute('name', 'displayName');
    await expect(input).toHaveAttribute('autocomplete', 'name');
    await expect(input).toHaveAccessibleDescription('Shown next to your contributions.');
    const invalid = page.getByRole('textbox', { name: 'Email address' });
    await expect(invalid).toHaveAttribute('aria-invalid', 'true');
    await expect(invalid).toHaveAccessibleDescription(/Enter a valid email address\./);
    await expect(invalid).toHaveCSS('border-top-color', 'rgb(180, 35, 58)');
    await page.getByRole('button', { name: 'Focus email field' }).click();
    await expect(invalid).toBeFocused();
    // e2e-locator: The consumer callback class identifies the field wrapper whose state is under test.
    await expect(page.locator('.consumer-invalid')).toContainText('Email address');
    await expect(page.getByRole('textbox', { name: 'Read-only note' })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(page.getByRole('textbox', { name: 'Disabled note' })).toBeDisabled();
  });

  test('the real combobox portal supports filtering, selection, escape, and disabled options', async ({
    page,
  }, testInfo) => {
    const input = page.getByRole('combobox', { name: 'Plant', exact: true });
    // Settle the document scroll before opening a popup that dismisses on scroll.
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('Fer');
    await expect(page.getByRole('option', { name: 'Fern', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Fern');
    await expect(page.getByText('Selected: fern', { exact: true })).toBeVisible();
    await input.clear();
    await input.press('ArrowDown');
    const list = page.getByRole('listbox', { name: 'Suggestions Plant', exact: true });
    await expect(list).toBeVisible();
    expect(
      await list.evaluate((element) => document.getElementById('root')?.contains(element)),
    ).toBe(false);
    // e2e-locator: The roleless popup surface around the named listbox owns its background.
    await expect(list.locator('..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // e2e-locator: Read the document font to compare actual body-portal inheritance.
    const bodyFont = await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).fontFamily);
    await expect(list).toHaveCSS('font-family', bodyFont);
    await expect(page.getByRole('option', { name: 'Maple' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.screenshot({ path: testInfo.outputPath('components-portal.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(input).toBeFocused();
  });

  test('clicking empty collection content cannot fabricate a selected value', async ({ page }) => {
    const empty = page.getByRole('combobox', { name: 'Empty collection' });
    await empty.scrollIntoViewIfNeeded();
    await empty.click();
    await empty.press('ArrowDown');
    await expect(page.getByText('No options found.', { exact: true })).toBeVisible();
    await page.getByText('No options found.', { exact: true }).click();
    await expect(empty).toHaveValue('');
    await expect(page.getByText('Selected empty key: none', { exact: true })).toBeVisible();
  });

  test('a focused empty combobox cannot select with Enter and keeps focus after Escape', async ({
    page,
  }) => {
    const empty = page.getByRole('combobox', { name: 'Empty collection' });
    await empty.scrollIntoViewIfNeeded();
    await empty.click();
    await expect(empty).toBeFocused();
    await empty.press('ArrowDown');
    await expect(page.getByText('No options found.', { exact: true })).toBeVisible();
    await empty.press('Enter');
    await expect(empty).toHaveValue('');
    await expect(page.getByText('Selected empty key: none', { exact: true })).toBeVisible();
    await expect(empty).toBeFocused();
    await expect(empty).toHaveAttribute('aria-expanded', 'false');
    await empty.press('ArrowDown');
    await expect(page.getByText('No options found.', { exact: true })).toBeVisible();
    await empty.press('Escape');
    await expect(empty).toBeFocused();
    await expect(empty).toHaveAttribute('aria-expanded', 'false');
  });

  test('a retained disabled selection stays readable and cannot be selected again', async ({
    page,
  }) => {
    const input = page.getByRole('combobox', { name: 'Retired selection' });
    await expect(input).toHaveValue('Fern');
    await input.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Show options Retired selection' }).click();
    const option = page.getByRole('option', { name: 'Fern', exact: true });
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expect(option).toHaveAttribute('aria-disabled', 'true');
    await expect(option).toHaveCSS('color', 'rgb(82, 97, 118)');
    await expect(option).toHaveCSS('background-color', 'rgb(229, 235, 242)');
    // Playwright intentionally refuses a disabled target; dispatch a real pointer click
    // at its bounds to verify React Aria itself suppresses selection.
    const bounds = await option.boundingBox();
    if (!bounds) throw new Error('Retained option has no layout bounds.');
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(input).toHaveValue('Fern');
    await expect(page.getByText('Retired selection changes: 0', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toBeFocused();
  });

  test('long option text remains inside a narrow viewport and reduced motion keeps progress visible', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const input = page.getByRole('combobox', { name: 'Plant', exact: true });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('particularly');
    const option = page.getByRole('option', { name: /A particularly long botanical/ });
    await expect(option).toBeVisible();
    const bounds = await option.boundingBox();
    if (!bounds) throw new Error('Long option has no layout bounds.');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await page.screenshot({ path: testInfo.outputPath('components-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
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

  test('exclusive choices follow arrow keys, skip disabled options and retain visible focus', async ({
    page,
  }, testInfo) => {
    const group = page.getByRole('radiogroup', { name: 'Collection layout' });
    const list = group.getByRole('radio', { name: 'List', exact: true });
    const grid = group.getByRole('radio', { name: 'Grid', exact: true });
    await group.scrollIntoViewIfNeeded();
    await list.focus();
    await list.press('ArrowRight');
    await expect(grid).toBeChecked();
    await expect(grid).toBeFocused();
    await expect(list).not.toBeChecked();
    await expect(group.getByRole('radio', { name: 'Map', exact: true })).toBeDisabled();
    await expect(page.getByText('Current layout: grid', { exact: true })).toBeVisible();
    // e2e-locator: React Aria's wrapping label owns the visible target and focus treatment.
    const visibleChoice = grid.locator('..').locator('..');
    await expect(visibleChoice).toHaveCSS('min-height', '44px');
    await expect(visibleChoice).toHaveCSS('outline-width', '3px');
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(visibleChoice).toHaveCSS('forced-color-adjust', 'none');
    await page.screenshot({ path: testInfo.outputPath('components-segmented-focus.png') });
    await grid.press('ArrowLeft');
    await expect(list).toBeChecked();
    await expect(grid).not.toBeChecked();
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
