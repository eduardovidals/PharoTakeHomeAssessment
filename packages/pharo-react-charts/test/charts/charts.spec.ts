import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, preview, rolldownVersion, version } from 'vite';
import type { Plugin, PreviewServer, ResolvedConfig } from 'vite';

interface BundleModule {
  id: string;
  renderedLength: number;
  renderedExports: readonly string[];
}

interface BundleChunk {
  file: string;
  imports: readonly string[];
  dynamicImports: readonly string[];
  modules: readonly BundleModule[];
}

type BundleSettings = { mode: string } & Pick<
  ResolvedConfig['build'],
  'target' | 'minify' | 'cssMinify' | 'sourcemap'
>;

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

let bundleReport: Awaited<ReturnType<typeof auditBundle>> | undefined;

const runtimePackages = new Set([
  '@pharo/react-charts',
  'react',
  'react-dom',
  'scheduler',
  'd3-array',
  'd3-color',
  'd3-format',
  'd3-interpolate',
  'd3-path',
  'd3-scale',
  'd3-shape',
  'd3-time',
  'd3-time-format',
  'internmap',
  'tailwind-merge',
]);

const virtualModules = new Set(['\0rolldown/runtime.js', '\0vite/modulepreload-polyfill.js']);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) files.push(...(await filesBelow(file)));
    else if (entry.isFile()) files.push(file);
    else throw new Error('A bundle input or output is not an ordinary file.');
  }

  return files.sort();
}

async function measuredFile(file: string, name: string) {
  const bytes = await readFile(file);

  return {
    file: name,
    bytes: bytes.byteLength,
    gzipLevel9Bytes: gzipSync(bytes, { level: 9 }).byteLength,
    sha256: sha256(bytes),
  };
}

async function auditBundle(
  consumer: string,
  chunks: readonly BundleChunk[],
  settings: BundleSettings,
) {
  expect(settings.mode).toBe('production');
  expect(settings.minify).toBe('oxc');
  expect(settings.cssMinify).toBe('lightningcss');
  expect(settings.sourcemap).toBe(false);
  expect(chunks.length).toBeGreaterThan(0);

  const emittedChunks = new Set(chunks.map((chunk) => chunk.file));
  const installation = await realpath(path.join(repositoryDirectory, 'node_modules/.pnpm'));
  const installedChart = await realpath(path.join(consumer, 'node_modules/@pharo/react-charts'));
  const entries = new Map(
    await Promise.all(
      ['main.tsx', 'styles.css', 'index.html'].map(
        async (file) => [await realpath(path.join(consumer, file)), `fixture/${file}`] as const,
      ),
    ),
  );
  const packages = new Map<string, { root: string; version: string }>();
  const modules: Array<Omit<BundleModule, 'id'> & { origin: string; chunk: string }> = [];

  for (const chunk of chunks) {
    // Externalized dependencies must not bypass the included-module audit.
    for (const specifier of [...chunk.imports, ...chunk.dynamicImports]) {
      const relative = path.posix.normalize(
        path.posix.join(path.posix.dirname(chunk.file), specifier),
      );

      expect(emittedChunks.has(specifier) || emittedChunks.has(relative)).toBe(true);
    }

    for (const module of chunk.modules) {
      let origin: string;

      if (module.id.startsWith('\0')) {
        expect(virtualModules.has(module.id)).toBe(true);

        origin = `virtual/${module.id.slice(1)}`;
      } else {
        const file = await realpath(module.id);
        const entry = entries.get(file);

        if (entry) origin = entry;
        else {
          expect(
            file.startsWith(installation + path.sep) || file.startsWith(installedChart + path.sep),
          ).toBe(true);

          let directory = path.dirname(file);
          let owner: { name: string; version: string; root: string } | undefined;

          while (
            directory.startsWith(installation + path.sep) ||
            directory === installedChart ||
            directory.startsWith(installedChart + path.sep)
          ) {
            const manifest = path.join(directory, 'package.json');
            const exists = await lstat(manifest).catch((error: unknown) => {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
                return undefined;

              throw error;
            });

            if (exists) {
              const metadata: unknown = JSON.parse(await readFile(manifest, 'utf8'));

              if (
                !metadata ||
                typeof metadata !== 'object' ||
                !('name' in metadata) ||
                typeof metadata.name !== 'string' ||
                !('version' in metadata) ||
                typeof metadata.version !== 'string'
              )
                throw new Error('A bundled package has incomplete identity metadata.');

              owner = { name: metadata.name, version: metadata.version, root: directory };
              break;
            }

            directory = path.dirname(directory);
          }

          if (!owner) throw new Error('A bundled module has no recognized package owner.');

          expect(runtimePackages.has(owner.name)).toBe(true);

          if (owner.name === '@pharo/react-charts') {
            expect(owner.root).toBe(installedChart);
            expect(path.relative(owner.root, file)).toBe(path.join('dist', 'index.js'));
          }

          const previous = packages.get(owner.name);

          if (previous) expect(previous).toEqual({ root: owner.root, version: owner.version });

          packages.set(owner.name, { root: owner.root, version: owner.version });
          origin = `${owner.name}@${owner.version}/${path.relative(owner.root, file).split(path.sep).join('/')}`;
        }
      }

      expect(origin).not.toMatch(
        /(?:^|\/)(?:__tests__|tests?|stories)(?:\/|\.)|\.stories\.[cm]?[jt]sx?$/,
      );

      modules.push({
        origin,
        chunk: chunk.file,
        renderedLength: module.renderedLength,
        renderedExports: module.renderedExports,
      });
    }
  }

  for (const required of [
    'react',
    'react-dom',
    '@pharo/react-charts',
    'd3-array',
    'd3-scale',
    'd3-shape',
    'd3-time-format',
  ])
    expect(packages.has(required)).toBe(true);

  const output = path.join(consumer, 'dist');
  const assets: Array<Awaited<ReturnType<typeof measuredFile>>> = [];

  for (const file of await filesBelow(output)) {
    const name = path.relative(output, file).split(path.sep).join('/');

    expect(name).toMatch(/\.(?:js|css|html)$/);

    const text = await readFile(file, 'utf8');

    expect(text).not.toContain(marker);
    expect(text).not.toContain('.dev-private/');
    expect(text).not.toContain('19149');

    assets.push(await measuredFile(file, name));
  }

  for (const file of emittedChunks) expect(assets.some((asset) => asset.file === file)).toBe(true);

  const inputs = [];
  const inputFiles = [
    ...['main.tsx', 'styles.css', 'index.html'].map((file) => path.join(consumer, file)),
    path.join(installedChart, 'package.json'),
    ...(await filesBelow(path.join(installedChart, 'dist'))),
    path.join(consumer, 'node_modules/@pharo/tailwind-plugin/package.json'),
    path.join(consumer, 'node_modules/@pharo/tailwind-plugin/index.css'),
  ];

  for (const file of inputFiles)
    inputs.push({
      path: path.relative(consumer, file).split(path.sep).join('/'),
      sha256: sha256(await readFile(file)),
    });

  inputs.push({
    path: 'workspace/pnpm-lock.yaml',
    sha256: sha256(await readFile(path.join(repositoryDirectory, 'pnpm-lock.yaml'))),
  });

  const totals = (extension: string) =>
    assets
      .filter((asset) => asset.file.endsWith(extension))
      .reduce(
        (total, asset) => ({
          bytes: total.bytes + asset.bytes,
          gzipLevel9Bytes: total.gzipLevel9Bytes + asset.gzipLevel9Bytes,
        }),
        { bytes: 0, gzipLevel9Bytes: 0 },
      );

  return {
    description:
      'Complete minified fixture consumer, including React/DOM, retained dependencies, theme CSS and harness. Suite results are reported separately.',
    command: 'node scripts/nx.mjs run @pharo/react-charts:e2e',
    tools: {
      node: process.version,
      zlib: process.versions.zlib,
      vite: version,
      rolldown: rolldownVersion,
    },
    settings,
    method:
      'Final file byte lengths and Node gzipSync level 9, summed per file. Module renderedLength is pre-minification diagnostic, not final size attribution.',
    resolution:
      'Copied public chart export map/dist and theme inputs; ordinary runtime dependencies resolve from the existing workspace installation.',
    assets,
    totals: { javascript: totals('.js'), css: totals('.css') },
    externalizedLibrary: {
      description:
        'Unminified externalized owned ESM, excluding runtime dependencies and theme; not total consumer download size.',
      ...(await measuredFile(
        path.join(installedChart, 'dist/index.js'),
        '@pharo/react-charts/dist/index.js',
      )),
    },
    packages: [...packages]
      .map(([name, owner]) => ({ name, version: owner.version, physicalRoots: 1 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    chunks: chunks.map(({ file, imports, dynamicImports }) => ({ file, imports, dynamicImports })),
    modules: modules.sort((a, b) => a.origin.localeCompare(b.origin)),
    inputs,
  };
}

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

    const chunks: BundleChunk[] = [];
    let settings: BundleSettings | undefined;
    const reportPlugin = {
      name: 'chart-consumer-audit',
      configResolved(config) {
        settings = {
          mode: config.mode,
          target: config.build.target,
          minify: config.build.minify,
          cssMinify: config.build.cssMinify,
          sourcemap: config.build.sourcemap,
        };
      },
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue;

          chunks.push({
            file: chunk.fileName,
            imports: [...chunk.imports],
            dynamicImports: [...chunk.dynamicImports],
            modules: Object.entries(chunk.modules).map(([id, module]) => ({
              id,
              renderedLength: module.renderedLength,
              renderedExports: [...module.renderedExports],
            })),
          });
        }
      },
    } satisfies Plugin;

    await build({
      root: fixture,
      mode: 'production',
      configFile: false,
      envDir: false,
      cacheDir: path.join(fixture, '.vite'),
      plugins: [react(), tailwindcss(), reportPlugin],
      resolve: { dedupe: ['react', 'react-dom'] },
      logLevel: 'warn',
      build: { outDir: 'dist', sourcemap: false, minify: 'oxc', cssMinify: 'lightningcss' },
    });

    if (!settings) throw new Error('The consumer build did not report resolved settings.');

    bundleReport = await auditBundle(fixture, chunks, settings);

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

    await page.getByRole('button', { name: 'Add east' }).click();
    await page.getByRole('button', { name: 'Resize first chart' }).click();

    await expect(first).toHaveAttribute('width', '256');

    const slider = page.getByRole('slider', { name: 'Inspect Greenhouse temperature' });

    await slider.press('Home');
    await slider.press('ArrowRight');

    await expect(slider).toHaveValue('1');

    const details = page.getByRole('region', { name: 'Details for Greenhouse temperature' });

    await expect(details).toContainText('2024-03-11');
    await expect(details.getByText('10', { exact: true })).toBeVisible();
    await expect(details.getByText('15', { exact: true })).toBeVisible();
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();

    // e2e-locator: Inspect real definition-list tracks and text rectangles in a
    // 256px desktop container; accessible text alone misses cramped column wrapping.
    const detailList = details.locator('dl');
    const compact = await detailList.evaluate((list) => {
      const listBounds = list.getBoundingClientRect();
      const rows = Array.from(list.children).map((row) => {
        const term = row.querySelector('dt');
        const value = row.querySelector('dd');

        if (!term || !value) throw new Error('Chart detail has no associated term and value.');

        const bounds = row.getBoundingClientRect();
        const valueBounds = value.getBoundingClientRect();
        const text = document.createRange();

        text.selectNodeContents(value);

        return {
          label: term.textContent,
          value: value.textContent,
          top: bounds.top,
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          valueLeft: valueBounds.left,
          valueRight: valueBounds.right,
          lines: Array.from(text.getClientRects()).map((line) => ({
            left: line.left,
            right: line.right,
          })),
        };
      });

      return {
        left: listBounds.left,
        right: listBounds.right,
        overflow: list.scrollWidth > list.clientWidth,
        rows,
      };
    });

    expect(compact.rows.map((row) => [row.label, row.value])).toEqual([
      ['North greenhouse', '10'],
      ['South greenhouse', '15'],
      ['East greenhouse', 'Unavailable'],
    ]);
    expect(
      compact.rows.every((row, index) => {
        const previous = compact.rows[index - 1];

        return (
          row.left >= compact.left - 0.5 &&
          row.right <= compact.right + 0.5 &&
          (!previous || row.top >= previous.bottom || row.left >= previous.right + 4)
        );
      }),
    ).toBe(true);

    const unavailable = compact.rows.find((row) => row.label === 'East greenhouse');

    if (!unavailable) throw new Error('The recorded missing East observation is absent.');

    expect(unavailable.lines).toHaveLength(1);
    expect(
      unavailable.lines.every(
        (line) =>
          line.left >= unavailable.valueLeft - 0.5 && line.right <= unavailable.valueRight + 0.5,
      ),
    ).toBe(true);
    expect(compact.overflow).toBe(false);
    expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(first).toHaveAttribute('height', '320');

    await page.screenshot({
      path: testInfo.outputPath('charts-compact-desktop-container.png'),
      fullPage: true,
    });

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

    const wideRows = await detailList.evaluate((list) =>
      Array.from(list.children).map((row) => {
        const bounds = row.getBoundingClientRect();

        return { top: bounds.top, left: bounds.left, right: bounds.right };
      }),
    );

    expect(
      wideRows.some((row, index) =>
        wideRows.some(
          (other, otherIndex) => index !== otherIndex && Math.abs(row.top - other.top) < 1,
        ),
      ),
    ).toBe(true);

    const wideBounds = await detailList.boundingBox();

    if (!wideBounds) throw new Error('Restored wide detail list is not visible.');

    expect(
      wideRows.every(
        (row) =>
          row.left >= wideBounds.x - 0.5 && row.right <= wideBounds.x + wideBounds.width + 0.5,
      ),
    ).toBe(true);
    await expect(slider).toHaveValue('1');
    await expect(details.getByText('10', { exact: true })).toBeVisible();
    await expect(details.getByText('15', { exact: true })).toBeVisible();
    await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(first).toHaveAttribute('height', '320');
    await expect(second).toHaveAttribute('width', String(secondWidth));
    await expect(second).toHaveAttribute('height', '320');

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

    expect(style.stroke).toBe('rgb(124, 58, 237)');
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

  test('an optional baseline expands the shared domain without inventing records or resetting inspection', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);

    const example = page.getByRole('region', { name: 'Generic baseline example' });
    const chart = example.getByRole('img', { name: 'Referenced measurements', exact: true });

    await expect(chart).toBeVisible();

    // e2e-locator: inspect the explicit reference-line and series geometry, which have no independent interactive role.
    const baseline = chart.locator('line[data-chart-baseline="0"]');
    const seriesPath = chart.locator('[data-series-id="reference-sensor"] > path');

    await expect(baseline).toHaveCount(1);
    await expect(baseline).toHaveCSS('stroke-width', '1px');
    await expect(baseline).not.toHaveCSS('stroke', 'none');
    await expect(seriesPath).toHaveCSS('fill', 'none');

    const withBaseline = await seriesPath.getAttribute('d');

    if (withBaseline === null) throw new Error('Expected a recorded series path.');

    expect(withBaseline).not.toMatch(/NaN|Infinity/);

    const reference = await baseline.evaluate((element) => ({
      x1: Number(element.getAttribute('x1')),
      x2: Number(element.getAttribute('x2')),
      y1: Number(element.getAttribute('y1')),
      y2: Number(element.getAttribute('y2')),
    }));

    expect(Object.values(reference).every(Number.isFinite)).toBe(true);
    expect(reference.x2).toBeGreaterThan(reference.x1);
    expect(reference.y1).toBe(reference.y2);

    const slider = example.getByRole('slider', { name: 'Inspect Referenced measurements' });

    await slider.focus();
    await slider.press('Home');

    await expect(slider).toHaveValue('0');

    const details = example.getByRole('region', { name: 'Details for Referenced measurements' });

    await expect(details.getByText('2', { exact: true })).toBeVisible();

    await example.screenshot({ path: testInfo.outputPath('baseline-390.png') });
    await example.getByRole('button', { name: 'Toggle reference baseline' }).click();

    await expect(baseline).toHaveCount(0);
    await expect(seriesPath).not.toHaveAttribute('d', withBaseline);
    await expect(slider).toHaveValue('0');
    await expect(details.getByText('2', { exact: true })).toBeVisible();

    await example.getByRole('button', { name: 'Toggle reference baseline' }).click();

    await expect(baseline).toHaveCount(1);
    await expect(seriesPath).toHaveAttribute('d', withBaseline);

    await example
      .getByRole('button', { name: 'Show data table for Referenced measurements' })
      .click();

    const table = example.getByRole('table', { name: 'Data for Referenced measurements' });

    await expect(table.getByRole('rowheader')).toHaveCount(3);

    for (const value of ['2', '8', '4'])
      await expect(table.getByRole('cell', { name: value, exact: true })).toBeVisible();

    await expect(table.getByRole('cell', { name: '0', exact: true })).toHaveCount(0);
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

  test('recorded candidates keep readable real-date spacing at narrow widths in different timezones', async ({
    browser,
  }, testInfo) => {
    const allowed = [
      'Mar 10',
      'Mar 11',
      'Mar 13',
      'Mar 14',
      'Mar 18',
      'Mar 19',
      'Mar 21',
      'Mar 25',
    ];
    const observations: Record<string, readonly string[]> = {};

    for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
      const context = await browser.newContext({ timezoneId });
      const errors: string[] = [];

      try {
        const page = await context.newPage();

        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin);

        const example = page.getByRole('region', { name: 'Recorded candidate example' });
        const chart = example.getByRole('img', { name: 'Recorded candidate measurements' });

        await expect(chart).toBeVisible();

        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 1000 });

          // e2e-locator: Actual rendered SVG bounds prove label spacing without a DOM simulation.
          const labels = chart.locator('g[aria-label="UTC time axis"] text');

          await expect
            .poll(async () => {
              const bounds = await chart.boundingBox();
              const expectedWidth = await example.evaluate((element) => element.clientWidth);

              return (
                bounds &&
                bounds.x + bounds.width <= width &&
                Number(await chart.getAttribute('width')) === expectedWidth
              );
            })
            .toBe(true);
          await expect
            .poll(() =>
              labels.evaluateAll((elements) =>
                elements.every((element, index) => {
                  const previous = elements[index - 1]?.getBoundingClientRect();

                  return !previous || element.getBoundingClientRect().left >= previous.right + 4;
                }),
              ),
            )
            .toBe(true);

          const rendered = await labels.evaluateAll((elements) =>
            elements.map((element) => ({
              text: [...element.childNodes]
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent)
                .join(''),
              left: element.getBoundingClientRect().left,
              right: element.getBoundingClientRect().right,
              position: Number(element.getAttribute('x')),
              compressed: element.hasAttribute('textLength'),
            })),
          );

          expect(rendered.length).toBeGreaterThan(1);
          expect(rendered[0]?.text).toBe('Mar 10');
          expect(rendered.at(-1)?.text).toBe('Mar 25');
          expect(rendered.every((item) => allowed.includes(item.text) && !item.compressed)).toBe(
            true,
          );

          const bounds = await chart.boundingBox();

          if (!bounds) throw new Error('Recorded chart is not visible.');

          expect(
            rendered.every(
              (item) => item.left >= bounds.x && item.right <= bounds.x + bounds.width,
            ),
          ).toBe(true);
          expect(await chart.evaluate((element) => element.outerHTML)).not.toMatch(/NaN|Infinity/);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);

          observations[`${timezoneId}-${width}`] = rendered.map((item) => item.text);

          if (width === 1440) {
            const plotWidth = Number(await chart.getAttribute('width')) - 72;

            for (const item of rendered) {
              const daysAfterFirst = Number(item.text.slice(4)) - 10;

              expect(item.position).toBeCloseTo(56 + (daysAfterFirst / 15) * plotWidth, 5);
            }
          }

          if (timezoneId === 'America/New_York') {
            await example.screenshot({
              path: testInfo.outputPath(`recorded-candidates-${width}.png`),
            });
          }
        }

        const slider = page.getByRole('slider', {
          name: 'Inspect Recorded candidate measurements',
        });

        await slider.press('Home');
        await slider.press('ArrowRight');
        await slider.press('ArrowRight');

        const details = page.getByRole('region', {
          name: 'Details for Recorded candidate measurements',
        });

        await expect(details).toContainText('2024-03-13');
        await expect(details).toContainText('Unavailable');
        await expect(details.getByText('2024-03-13', { exact: true })).toHaveAttribute(
          'datetime',
          '2024-03-13T00:00:00.000Z',
        );
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }

    for (const width of [320, 390, 1440]) {
      expect(observations[`America/New_York-${width}`]).toEqual(
        observations[`Asia/Tokyo-${width}`],
      );
    }

    const narrow = observations['America/New_York-320'];
    const wide = observations['America/New_York-1440'];

    if (!narrow || !wide) throw new Error('Missing measured candidate labels for comparison.');

    expect(narrow.length).toBeLessThan(wide.length);
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

        await expect(dateLabels.filter({ hasText: 'Mar 10' })).toBeVisible();
        await expect(dateLabels.filter({ hasText: 'Mar 12' })).toBeVisible();

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

  test('external data access opens complete raw records and the consumer restores inline access when hiding its trigger', async ({
    page,
  }, testInfo) => {
    const example = page.getByRole('region', { name: 'External data example' });
    const chart = example.getByRole('img', { name: 'External recorded measurements' });
    const trigger = example.getByRole('button', { name: 'View external records' });

    await expect(chart).toHaveAttribute('aria-details', 'external-data-trigger');
    await expect(
      example.getByRole('button', { name: 'Show data table for External recorded measurements' }),
    ).toHaveCount(0);

    await trigger.click();

    const table = example.getByRole('table', { name: 'External recorded values' });

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
    await expect(chart).toHaveAttribute('height', '320');

    await trigger.click();
    await example.getByRole('button', { name: 'Toggle external trigger visibility' }).click();

    const fallback = example.getByRole('button', {
      name: 'Show data table for External recorded measurements',
    });

    await expect(fallback).toBeVisible();
    await expect(chart).not.toHaveAttribute('aria-details', 'external-data-trigger');

    await fallback.click();

    await expect(
      example.getByRole('table', { name: 'Data for External recorded measurements' }),
    ).toBeVisible();

    await example.getByRole('button', { name: 'Toggle external trigger visibility' }).click();

    await expect(chart).toHaveAttribute('aria-details', 'external-data-trigger');
    await expect(
      example.getByRole('button', { name: 'Hide data table for External recorded measurements' }),
    ).toHaveCount(0);

    for (const name of ['Unavailable external trigger', 'Blank external trigger']) {
      const button = page.getByRole('button', { name: `Show data table for ${name}` });

      await button.click();

      await expect(page.getByRole('table', { name: `Data for ${name}` })).toBeVisible();
    }

    await trigger.click();
    await example.screenshot({ path: testInfo.outputPath('charts-external-data.png') });
  });

  test('compact readout starts latest and reveals keyboard help without clipping at responsive widths', async ({
    page,
  }, testInfo) => {
    const example = page.getByRole('region', { name: 'Recorded candidate example' });
    const details = example.getByRole('region', {
      name: 'Details for Recorded candidate measurements',
    });
    const slider = example.getByRole('slider', { name: 'Inspect Recorded candidate measurements' });

    await expect(slider).toHaveValue('7');
    await expect(details).toContainText('2024-03-25');

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });

      await expect
        .poll(() => details.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(details).not.toHaveAttribute('aria-live');

      await example.screenshot({ path: testInfo.outputPath(`charts-compact-${width}.png`) });
    }

    await slider.press('Home');

    await expect(slider).toHaveValue('0');
    await expect(details).toContainText('2024-03-10');

    const help = await slider.getAttribute('aria-describedby');

    expect(help).toBeTruthy();

    // e2e-locator: The range's explicit description identifies the real focus-revealed instruction element.
    const helpBounds = await slider.evaluate((element) => {
      const description = element.ownerDocument.getElementById(
        element.getAttribute('aria-describedby') ?? '',
      );

      if (!description) throw new Error('Keyboard instructions are missing.');

      const bounds = description.getBoundingClientRect();

      return { width: bounds.width, height: bounds.height };
    });

    expect(helpBounds.width).toBeGreaterThan(20);
    expect(helpBounds.height).toBeGreaterThan(10);

    await page.setViewportSize({ width: 320, height: 900 });

    await expect(slider).toHaveValue('0');

    await example.screenshot({ path: testInfo.outputPath('charts-compact-keyboard.png') });
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
    await expect(other).toContainText('2024-03-12');

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
    // e2e-locator: Inspection geometry marks only the exact available recorded series.
    const inspection = chart.locator('[data-chart-inspection]');
    const dots = inspection.locator('[data-inspection-series-id]');

    await page.emulateMedia({ reducedMotion: 'no-preference' });

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
      await expect(dots).toHaveCount(1);
      await expect(dots).toHaveAttribute('data-inspection-series-id', 'unequal-north');

      await page.mouse.move(left + span / 3, y);

      await expect(details).toContainText('2024-03-11');
      await expect(details.getByText('20', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
      await expect(dots).toHaveCount(1);
      await expect(dots).toHaveAttribute('data-inspection-series-id', 'unequal-south');
      await expect(dots.locator('circle')).toBeVisible();
      await expect(inspection).toHaveCSS('transition-duration', '0.12s');
      await expect(dots).toHaveCSS('transition-duration', '0.12s');

      await inspection.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished),
        );
      });

      // Attach the observer before moving the pointer so the mutation cannot be missed.
      const capture = await inspection.evaluateHandle((element) => {
        const dot = element.querySelector('[data-inspection-series-id="unequal-south"]');

        if (!dot) throw new Error('The exact southern observation marker is missing.');

        const position = () => ({
          x: new DOMMatrix(getComputedStyle(element).transform).e,
          y: new DOMMatrix(getComputedStyle(dot).transform).f,
        });

        const start = position();
        const originalTransform = element.getAttribute('transform');

        const result = new Promise<{
          start: typeof start;
          halfway: typeof start;
          end: typeof start;
          animations: number;
        }>((resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (element.getAttribute('transform') === originalTransform) return;

            observer.disconnect();

            try {
              // Flush the real SVG style change, then seek its native transitions to avoid clock races.
              position();

              const animations = [...element.getAnimations(), ...dot.getAnimations()];

              for (const animation of animations) {
                animation.pause();
                animation.currentTime = Number(animation.effect?.getTiming().duration) / 2;
              }

              const halfway = position();

              for (const animation of animations) animation.finish();

              resolve({ start, halfway, end: position(), animations: animations.length });
            } catch (error) {
              reject(error);
            }
          });

          observer.observe(element, { attributes: true, attributeFilter: ['transform'] });
        });

        return { result };
      });

      await page.mouse.move(left + (2 * span) / 3, y);
      const motion = await capture.evaluate(({ result }) => result);
      await capture.dispose();

      expect(motion.animations).toBe(2);
      expect(motion.halfway.x).toBeGreaterThan(motion.start.x);
      expect(motion.halfway.x).toBeLessThan(motion.end.x);
      expect(motion.halfway.y).toBeLessThan(motion.start.y);
      expect(motion.halfway.y).toBeGreaterThan(motion.end.y);
      expect(motion.end.x).toBeCloseTo(56 + (2 * (viewWidth - 72)) / 3, 3);
      expect(motion.end.y).toBeCloseTo(16, 3);
      await expect(dots).toHaveCount(1);
      await expect(dots).toHaveAttribute('data-inspection-series-id', 'unequal-south');
      await expect(details).toContainText('2024-03-12');
      await expect(details.getByText('30', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();

      await page.mouse.move(left + span + 4, y);

      await expect(details).toContainText('2024-03-13');
      await expect(details.getByText('8', { exact: true })).toBeVisible();
      await expect(dots).toHaveCount(1);
      await expect(dots).toHaveAttribute('data-inspection-series-id', 'unequal-north');

      await page.emulateMedia({ reducedMotion: 'reduce' });

      await expect(inspection).toHaveCSS('transition-duration', '0s');
      await expect(dots).toHaveCSS('transition-duration', '0s');

      await page.mouse.move(left, y);

      await expect(details).toContainText('2024-03-10');

      const reduced = await inspection.evaluate((element) => ({
        x: new DOMMatrix(getComputedStyle(element).transform).e,
        animations: element.getAnimations({ subtree: true }).length,
      }));

      expect(reduced.x).toBeCloseTo(56, 3);
      expect(reduced.animations).toBe(0);

      await page.mouse.move(0, 0);

      await expect(details).toContainText('2024-03-10');

      await page.emulateMedia({ reducedMotion: 'no-preference' });
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
      name: 'Data for Unequal calendar measurements',
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

      await expect(details).toContainText('2024-03-13');

      // Pan before tapping so consecutive contacts cannot become a double-tap drag gesture.
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
        await expect(details).toContainText('2024-03-13');
      } finally {
        await session.detach();
      }

      await chart.scrollIntoViewIfNeeded();
      box = await chart.boundingBox();

      if (!box) throw new Error('Touch chart disappeared before the tap.');

      const viewWidth = Number(await chart.getAttribute('width'));
      const secondDateX = box.x + ((56 + (viewWidth - 72) / 3) / viewWidth) * box.width;

      await page.touchscreen.tap(secondDateX, box.y + box.height / 2);

      await expect(details).toContainText('2024-03-11');
      await expect(details.getByText('20', { exact: true })).toBeVisible();
      await expect(details.getByText('Unavailable', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('controlled dates separate transient hover from pointer and native keyboard commits', async ({
    page,
  }, testInfo) => {
    const example = page.getByRole('region', { name: 'Controlled date example', exact: true });
    const chart = page.getByRole('img', { name: 'Controlled measurements', exact: true });
    const details = page.getByRole('region', { name: 'Details for Controlled measurements' });
    const slider = page.getByRole('slider', { name: 'Inspect Controlled measurements' });

    await chart.scrollIntoViewIfNeeded();

    const box = await chart.boundingBox();

    if (!box) throw new Error('Controlled chart has no visible rectangle.');

    const width = Number(await chart.getAttribute('width'));
    const x = box.x + (56 / width) * box.width;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);

    await expect(details).toContainText('2024-03-10');
    await expect(example.getByText('Comparison date: Latest', { exact: true })).toBeVisible();
    await expect(example.getByText('Explicit date changes: 0', { exact: true })).toBeVisible();
    await expect(slider).toHaveValue('3');

    await slider.press('ArrowLeft');

    await expect(example.getByText('Comparison date: 2024-03-12', { exact: true })).toBeVisible();
    await expect(slider).toHaveValue('2');

    await chart.scrollIntoViewIfNeeded();

    const updated = await chart.boundingBox();

    if (!updated) throw new Error('Controlled chart disappeared.');

    await page.mouse.click(
      updated.x + (56 / width) * updated.width,
      updated.y + updated.height / 2,
    );

    await expect(example.getByText('Comparison date: 2024-03-10', { exact: true })).toBeVisible();
    await expect(example.getByText('Explicit date changes: 2', { exact: true })).toBeVisible();

    await page.mouse.move(updated.x + updated.width - 16, updated.y + updated.height / 2);

    await expect(details).toContainText('2024-03-13');
    await expect(example.getByText('Comparison date: 2024-03-10', { exact: true })).toBeVisible();

    await page.mouse.move(updated.x, updated.y - 8);

    await expect(details).toContainText('2024-03-10');

    await slider.press('End');

    await expect(example.getByText('Comparison date: 2024-03-13', { exact: true })).toBeVisible();

    await slider.press('Home');

    await expect(example.getByText('Comparison date: 2024-03-10', { exact: true })).toBeVisible();

    await slider.press('Tab');

    await expect(
      page.getByRole('button', { name: 'Show data table for Controlled measurements' }),
    ).toBeFocused();

    await example.getByRole('button', { name: 'Back to latest comparison' }).click();

    await expect(example.getByText('Comparison date: Latest', { exact: true })).toBeVisible();
    await expect(slider).toHaveValue('3');

    await example.screenshot({ path: testInfo.outputPath('charts-controlled-date-desktop.png') });
  });

  test('controlled dates commit native touch once and leave vertical gestures uncommitted', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    try {
      const page = await context.newPage();

      await page.goto(origin);

      const example = page.getByRole('region', { name: 'Controlled date example', exact: true });
      const chart = page.getByRole('img', { name: 'Controlled measurements', exact: true });

      await chart.scrollIntoViewIfNeeded();

      let box = await chart.boundingBox();

      if (!box) throw new Error('Controlled touch chart has no visible rectangle.');

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
        await expect(example.getByText('Explicit date changes: 0', { exact: true })).toBeVisible();
      } finally {
        await session.detach();
      }

      await chart.scrollIntoViewIfNeeded();
      box = await chart.boundingBox();

      if (!box) throw new Error('Controlled touch chart disappeared.');

      const width = Number(await chart.getAttribute('width'));

      await page.touchscreen.tap(
        box.x + ((56 + (width - 72) / 3) / width) * box.width,
        box.y + box.height / 2,
      );

      await expect(example.getByText('Comparison date: 2024-03-11', { exact: true })).toBeVisible();
      await expect(example.getByText('Explicit date changes: 1', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('slider', { name: 'Inspect Controlled measurements' }),
      ).toHaveValue('1');

      await example.screenshot({ path: testInfo.outputPath('charts-controlled-date-mobile.png') });
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

    for (const name of [
      'formatXAxis',
      'baselineY',
      'formatXDetail',
      'formatXTable',
      'formatXAccessible',
      'formatYAxis',
      'formatYDetail',
      'formatYTable',
      'dataTable',
    ]) {
      await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
    }

    const labelControl = page
      .getByRole('row')
      .filter({ hasText: /^label\*/ })
      .getByRole('textbox');

    await labelControl.fill('Catalog control verification');
    await labelControl.press('Tab');

    const controlledChart = page.getByRole('img', {
      name: 'Catalog control verification',
      exact: true,
    });

    await expect(controlledChart).toBeVisible();
    await expect(
      page.getByRole('slider', { name: 'Inspect Catalog control verification' }),
    ).toBeVisible();

    const sizeRow = page.getByRole('row').filter({ hasText: /^className/ });

    await sizeRow.getByRole('button', { name: 'Set string' }).click();
    await sizeRow.getByRole('textbox').fill('h-96');
    await sizeRow.getByRole('textbox').press('Tab');

    await expect(controlledChart).toHaveAttribute('height', '384');

    await sizeRow.getByRole('textbox').fill('');
    await sizeRow.getByRole('textbox').press('Tab');

    await expect(controlledChart).toHaveAttribute('height', '320');

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

  test('the audited minified bundle is the actual browser-served consumer', async ({
    request,
  }, testInfo) => {
    if (!bundleReport) throw new Error('The consumer bundle report is unavailable.');

    expect(bundleReport.totals.javascript.bytes).toBeGreaterThan(0);
    expect(bundleReport.totals.css.bytes).toBeGreaterThan(0);

    for (const asset of bundleReport.assets) {
      const response = await request.get(`${origin}/${asset.file}`);

      expect(response.ok()).toBe(true);

      const bytes = await response.body();

      expect(sha256(bytes)).toBe(asset.sha256);
      expect(bytes.byteLength).toBe(asset.bytes);
    }

    const serialized = JSON.stringify(bundleReport, null, 2) + '\n';

    expect(serialized).not.toContain(repositoryDirectory);
    expect(serialized).not.toContain('.dev-private/');

    const reportPath = testInfo.outputPath('chart-bundle-report.json');

    await writeFile(reportPath, serialized);
    await testInfo.attach('chart-bundle-report', {
      path: reportPath,
      contentType: 'application/json',
    });
  });
});
