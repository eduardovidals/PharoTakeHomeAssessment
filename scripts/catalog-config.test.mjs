import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeStories, normalizeStoryPath } from 'storybook/internal/common';
import { build, createServer, mergeConfig, resolveConfig } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalogs = ['pharo-react-components', 'pharo-react-form-components', 'pharo-react-charts'];
const protectedPaths = [
  '.env',
  '.env.local',
  'client.pem',
  '.npmrc',
  '.yarnrc.yml',
  '.git/config',
  '.dev-private/sentinel.txt',
  '.factory-agent/sentinel.txt',
  '.private/sentinel.txt',
  '.reference/sentinel.txt',
  '.private-skills/sentinel.txt',
  'AGENTS.override.md',
  'fixture-custom-secret/sentinel.txt',
];
const sentinel = 'catalog-private-file-must-not-be-served';

/** Preserve the primary failure and independently release the owned host and fixture. */
async function withFixture(run) {
  const cache = path.join(root, 'node_modules/.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(path.join(cache, 'pharo-catalog-'));
  const identity = await lstat(directory);
  let server;
  const failures = [];
  try {
    await run(directory, (ownedServer) => {
      assert.equal(server, undefined, 'Each fixture owns one server');
      server = ownedServer;
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await server?.close();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 0) {
    try {
      const current = await lstat(directory);
      assert.ok(current.isDirectory() && !current.isSymbolicLink());
      assert.equal(current.dev, identity.dev, 'Fixture device ownership changed');
      assert.equal(current.ino, identity.ino, 'Fixture directory ownership changed');
      // Allow a bounded retry for Vite's final dependency-cache filesystem work.
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `Catalog fixture failed; inspect ${directory}`);
  }
}

for (const catalog of catalogs) {
  const directory = path.join(root, 'packages', catalog, '.storybook');
  const { default: configuration } = await import(pathToFileURL(path.join(directory, 'main.ts')));

  test(`${catalog}: discovers only its colocated public TSX stories`, () => {
    const entries = normalizeStories(configuration.stories, {
      configDir: directory,
      workingDir: root,
    });
    const matches = (file) =>
      entries.some((entry) => entry.importPathMatcher.test(normalizeStoryPath(file)));

    assert.ok(matches(`packages/${catalog}/src/PharoExample/PharoExample.stories.tsx`));
    assert.ok(matches(`packages/${catalog}/src/PharoExample.stories.tsx`));
    for (const file of [
      `packages/${catalog}/src/PharoExample/PharoExample.test.tsx`,
      `packages/${catalog}/archives/PharoExample.stories.tsx`,
      `packages/${catalog}/dist/PharoExample.stories.tsx`,
      `packages/${catalog}/node_modules/PharoExample.stories.tsx`,
      '.dev-private/PharoExample.stories.tsx',
      ...catalogs
        .filter((owner) => owner !== catalog)
        .map((owner) => `packages/${owner}/src/PharoExample.stories.tsx`),
    ]) {
      assert.equal(matches(file), false, file);
    }
    assert.deepEqual(configuration.addons, ['@storybook/addon-docs', '@storybook/addon-a11y']);
    assert.equal(configuration.framework.name, '@storybook/react-vite');
  });

  test(`${catalog}: denies private HTTP files and compiles its real preview CSS`, async () => {
    await withFixture(async (fixture, ownServer) => {
      const defaults = await resolveConfig({ configFile: false, envDir: false }, 'serve');
      const final = await configuration.viteFinal({
        configFile: false,
        envDir: false,
        resolve: { dedupe: ['fixture-existing-dependency'] },
        server: { fs: { deny: ['**/fixture-custom-secret/**'] } },
      });
      assert.equal(final.server.host, '127.0.0.1');
      assert.equal(final.server.fs.strict, true);
      for (const rule of defaults.server.fs.deny)
        assert.ok(final.server.fs.deny.includes(rule), rule);
      assert.ok(final.resolve.dedupe.includes('fixture-existing-dependency'));
      assert.ok(final.resolve.dedupe.includes('react'));
      assert.ok(final.resolve.dedupe.includes('react-dom'));

      await writeFile(path.join(fixture, 'allowed.txt'), 'public-control');
      for (const file of protectedPaths) {
        const destination = path.join(fixture, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, sentinel);
      }

      const server = await createServer(
        mergeConfig(final, {
          root: fixture,
          logLevel: 'silent',
          server: { port: 0, fs: { allow: [fixture] } },
        }),
      );
      ownServer(server);
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address === 'object');
      const base = `http://127.0.0.1:${address.port}`;
      const control = await fetch(`${base}/allowed.txt`);
      assert.equal(control.status, 200);
      assert.equal(await control.text(), 'public-control');
      for (const file of protectedPaths) {
        for (const url of [`/${file}`, `/@fs${path.join(fixture, file)}`]) {
          const response = await fetch(`${base}${url}`);
          assert.equal(response.status, 403, url);
          assert.equal((await response.text()).includes(sentinel), false, url);
        }
      }

      const preview = path.join(directory, 'preview.ts');
      const theme = path.join(root, 'packages/pharo-tailwind-plugin/index.css');
      await writeFile(
        path.join(fixture, 'entry.tsx'),
        `import preview from ${JSON.stringify(preview)};\nimport './fixture.css';\n` +
          `export const configuration = preview;\nexport const element = <div>CSS fixture</div>;\n`,
      );
      await writeFile(
        path.join(fixture, 'fixture.css'),
        `@import ${JSON.stringify(theme)};\n@source inline("pressed:underline");\n`,
      );
      await writeFile(
        path.join(fixture, '.dev-private/scan-sentinel.tsx'),
        '<div className="z-[19137]">Excluded scan candidate</div>',
      );
      const compiled = await build(
        mergeConfig(final, {
          root: fixture,
          logLevel: 'silent',
          build: {
            write: false,
            minify: false,
            lib: { entry: path.join(fixture, 'entry.tsx'), formats: ['es'] },
          },
        }),
      );
      const outputs = (Array.isArray(compiled) ? compiled : [compiled]).flatMap(
        (result) => result.output,
      );
      const css = outputs
        .filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
        .map((output) => Buffer.from(output.source).toString('utf8'))
        .join('\n');
      assert.ok(css.length > 0, 'The actual preview import emits theme CSS');
      assert.match(css, /data-pressed/);
      assert.match(css, /text-decoration-line:\s*underline/);
      assert.match(css, /font-family:\s*var\(--default-font-family,/);
      assert.match(css, /--font-sans:[^;]*sans-serif[^;]*;/);
      assert.equal(css.includes('19137'), false, 'Private fixtures do not enter Tailwind scanning');
      const previewModule = outputs.find((output) => output.type === 'chunk' && output.isEntry);
      assert.ok(previewModule);
      assert.match(previewModule.code, /test:\s*["']error["']/);
      assert.match(previewModule.code, /autodocs/);
      assert.match(await readFile(preview, 'utf8'), /import ['"]@pharo\/tailwind-plugin['"]/);
    });
  });
}
