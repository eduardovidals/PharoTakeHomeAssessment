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
const marker = `PHARO_FORM_PRIVATE_${randomUUID()}`;
const pageFailures = new WeakMap<Page, string[]>();
const servers: PreviewServer[] = [];
let fixture: string | undefined;
let identity: { dev: number; ino: number } | undefined;
let origin = '';
let catalogOrigin = '';
let failed = false;

function serverOrigin(server: PreviewServer): string {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Form preview did not bind a port.');
  return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
  try {
    const cache = path.join(repositoryDirectory, 'node_modules/.cache');
    await mkdir(cache, { recursive: true });
    fixture = await mkdtemp(path.join(cache, 'pharo-forms-'));
    identity = await lstat(fixture);
    await cp(path.join(packageDirectory, 'test/fixture'), fixture, { recursive: true });
    // Resolve public export maps from real manifests and build bytes, with no source alias.
    for (const name of ['react-components', 'react-form-components']) {
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
    await writeFile(path.join(fixture, '.dev-private/hidden.tsx'), '<div className="z-[19147]" />');
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
      expect(source).not.toContain('19147');
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
    expect(catalogIndex).toContain('forms-pharoformtextfield--docs');
    expect(catalogIndex).toContain('forms-pharoformcombobox--docs');
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
  await expect(page.getByRole('heading', { name: 'Schema-bound accessible forms' })).toBeVisible();
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
        throw new Error('Form fixture directory ownership changed.');
      await rm(fixture, { recursive: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (fixture && (failed || failures.length > 0))
    console.info(`Preserved form fixture: ${fixture}`);
  if (failures.length > 0) throw new AggregateError(failures, 'Form fixture cleanup failed.');
});

test.describe('Use schema-bound controls through built public exports', () => {
  test('validation focuses the invalid input and keyboard submission preserves schema transforms', async ({
    page,
  }) => {
    const name = page.getByRole('textbox', { name: 'Collection name' });
    const plant = page.getByRole('combobox', { name: 'Plant', exact: true });
    await page.getByRole('button', { name: 'Add plant', exact: true }).click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(/Enter at least two characters\./);
    await expect(name).toHaveCSS('border-top-color', 'rgb(180, 35, 58)');
    await name.fill('  Grace  ');
    await name.press('Enter');
    await expect(plant).toBeFocused();
    await expect(plant).toHaveAccessibleDescription(/Choose a plant\./);
    await plant.scrollIntoViewIfNeeded();
    await plant.fill('Fer');
    await expect(page.getByRole('option', { name: 'Fern', exact: true })).toBeVisible();
    await plant.press('ArrowDown');
    await plant.press('Enter');
    await expect(plant).toHaveValue('Fern');
    await page.getByRole('button', { name: 'Add plant', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Collection submission' })).toHaveText(
      'Submitted {"name":"Grace","plant":"FERN"}',
    );
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await expect(plant).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('filtering preserves a selected key and Escape restores its label before a deliberate clear', async ({
    page,
  }) => {
    const plant = page.getByRole('combobox', { name: 'Plant', exact: true });
    // RAC hides background outputs from the accessibility tree while its popup owns focus.
    const committed = page.getByLabel('Committed plant', { exact: true });
    await plant.scrollIntoViewIfNeeded();
    await plant.fill('Or');
    await expect(page.getByRole('option', { name: 'Orchid', exact: true })).toBeVisible();
    await plant.press('ArrowDown');
    await plant.press('Enter');
    await expect(committed).toHaveText('"orchid"');
    await plant.press('End');
    await plant.press('x');
    await expect(committed).toHaveText('"orchid"');
    await plant.press('Escape');
    await expect(plant).toHaveValue('Orchid');
    await plant.clear();
    await expect(committed).toHaveText('""');
    await plant.press('Escape');
    await expect(plant).toHaveAttribute('aria-expanded', 'false');
    await expect(plant).toBeFocused();
  });

  test('a fresh keyboard-controlled portal inherits the public theme and returns focus on Escape', async ({
    page,
  }, testInfo) => {
    const plant = page.getByRole('combobox', { name: 'Plant', exact: true });
    // e2e-locator: Read document typography before opening the body-portaled list.
    const bodyFont = await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).fontFamily);
    await plant.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Show options Plant', exact: true }).click();
    const list = page.getByRole('listbox', { name: 'Suggestions Plant', exact: true });
    await expect(list).toBeVisible();
    // Inspect one rendered portal snapshot, including its roleless parent surface.
    const portal = await list.evaluate((element) => {
      const surface = element.parentElement;
      if (!surface) throw new Error('The visible list has no popup surface.');
      return {
        insideConsumer: document.getElementById('root')?.contains(element),
        background: getComputedStyle(surface).backgroundColor,
        font: getComputedStyle(element).fontFamily,
      };
    });
    expect(portal).toEqual({
      insideConsumer: false,
      background: 'rgb(255, 255, 255)',
      font: bodyFont,
    });
    await page.screenshot({ path: testInfo.outputPath('forms-portal.png'), fullPage: true });
    await plant.press('Escape');
    await expect(list).toBeHidden();
    await expect(plant).toBeFocused();
  });

  test('untouched optional strings stay undefined while a real clear commits empty and preserves the consumer event', async ({
    page,
  }) => {
    // RAC makes background outputs aria-hidden while open; observe their labeled DOM state.
    const draft = page.getByLabel('Optional draft', { exact: true });
    const plant = page.getByRole('combobox', { name: 'Optional plant', exact: true });
    await expect(draft).toHaveText('{"values":{"preferences":{}},"dirty":false}');
    await page.getByRole('button', { name: 'Inspect optional values' }).click();
    await expect(page.getByRole('status', { name: 'Optional submission' })).toHaveText(
      '{"preferences":{}}',
    );
    await plant.scrollIntoViewIfNeeded();
    await plant.fill('Fer');
    await expect(page.getByRole('option', { name: 'Fern', exact: true })).toBeVisible();
    await expect(draft).toHaveText('{"values":{"preferences":{}},"dirty":false}');
    await plant.press('Escape');
    await expect(plant).toHaveValue('');
    await expect(draft).toHaveText('{"values":{"preferences":{}},"dirty":false}');
    await plant.fill('Or');
    await plant.clear();
    await expect(draft).toHaveText('{"values":{"preferences":{"plant":""}},"dirty":true}');
    await expect(page.getByLabel('Consumer input events', { exact: true })).not.toHaveText('0');
    await plant.press('Escape');
    await expect(plant).toHaveAttribute('aria-expanded', 'false');
    const note = page.getByRole('textbox', { name: 'Optional note' });
    await note.fill('Draft');
    await note.clear();
    await page.getByRole('button', { name: 'Inspect optional values' }).click();
    await expect(page.getByRole('status', { name: 'Optional submission' })).toHaveText(
      '{"preferences":{"note":"","plant":""}}',
    );
  });

  test('disabled values are omitted and restored while read-only values remain focusable and submitted', async ({
    page,
  }) => {
    const disabledNote = page.getByRole('textbox', { name: 'Disabled note' });
    const disabledPlant = page.getByRole('combobox', { name: 'Disabled plant' });
    const lockedNote = page.getByRole('textbox', { name: 'Locked note' });
    const lockedPlant = page.getByRole('combobox', { name: 'Locked plant' });
    const result = page.getByRole('status', { name: 'State submission' });
    await expect(disabledNote).toBeDisabled();
    await expect(disabledPlant).toBeDisabled();
    await lockedNote.click();
    await expect(lockedNote).toBeFocused();
    await lockedNote.press('x');
    await expect(lockedNote).toHaveValue('Published note');
    await lockedNote.press('Tab');
    await expect(lockedPlant).toBeFocused();
    await lockedPlant.press('ArrowDown');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit state example' }).click();
    await expect(result).toHaveText('{"readOnlyNote":"Published note","readOnlyPlant":"orchid"}');
    await page.getByRole('button', { name: 'Enable disabled fields' }).click();
    await expect(disabledNote).toBeEnabled();
    await expect(disabledNote).toHaveValue('Preserved note');
    await expect(disabledPlant).toBeEnabled();
    await expect(disabledPlant).toHaveValue('Fern');
    await page.getByRole('button', { name: 'Submit state example' }).click();
    await expect(result).toHaveText(
      '{"disabledNote":"Preserved note","disabledPlant":"fern","readOnlyNote":"Published note","readOnlyPlant":"orchid"}',
    );
    await page.getByRole('button', { name: 'Disable form' }).click();
    await expect(lockedNote).toBeDisabled();
    await expect(lockedPlant).toBeDisabled();
    await page.getByRole('button', { name: 'Submit state example' }).click();
    await expect(result).toHaveText('{}');
    await page.getByRole('button', { name: 'Enable form' }).click();
    await expect(lockedNote).toBeEnabled();
    await expect(lockedPlant).toHaveValue('Orchid');
  });

  test('long labels and real portaled options fit a 320 pixel viewport', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const plant = page.getByRole('combobox', {
      name: 'The plant variety selected for your shared indoor collection',
    });
    await plant.scrollIntoViewIfNeeded();
    await plant.click();
    await plant.press('ArrowDown');
    const list = page.getByRole('listbox', {
      name: 'Suggestions The plant variety selected for your shared indoor collection',
    });
    const long = page.getByRole('option', {
      name: 'A particularly long botanical variety name that wraps inside the available width',
    });
    await expect(list).toBeVisible();
    await expect(long).toBeVisible();
    expect(
      await list.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth;
      }),
    ).toBe(true);
    expect(await long.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('forms-narrow.png'), fullPage: true });
    await plant.press('Escape');
    await expect(plant).toBeFocused();
  });

  test('both compiled form catalog Docs render public labels and prop tables', async ({
    page,
  }, testInfo) => {
    for (const [id, heading] of [
      ['forms-pharoformtextfield--docs', 'PharoFormTextField'],
      ['forms-pharoformcombobox--docs', 'PharoFormComboBox'],
    ]) {
      await page.goto(`${catalogOrigin}/iframe.html?id=${id}&viewMode=docs`);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Name', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: /^label\*?$/ })).toBeVisible();
      await expect(page.getByRole('cell', { name: /^isDisabled$/ })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('forms-catalog-docs.png'), fullPage: true });
  });

  test('compiled and served consumer output excludes owned private sentinel bytes', async ({
    request,
  }) => {
    if (!fixture) throw new Error('Form fixture is unavailable.');
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
