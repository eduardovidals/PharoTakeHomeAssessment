import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Generator, getConfig } from '@tanstack/router-generator';
import { routerConfig } from './router-config.mjs';

const appDirectory = path.resolve(import.meta.dirname, '../apps/pharo-dashboard-ui');

async function withFixture(operation) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pharo-route-generation-'));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function copyAppRoutes(destination) {
  await cp(
    path.join(appDirectory, routerConfig.routesDirectory),
    path.join(destination, routerConfig.routesDirectory),
    {
      recursive: true,
    },
  );
  await cp(
    path.join(appDirectory, routerConfig.generatedRouteTree),
    path.join(destination, routerConfig.generatedRouteTree),
  );
}

async function checkGeneratedRoutes(sourceDirectory) {
  const committed = await readFile(path.join(sourceDirectory, routerConfig.generatedRouteTree));
  return withFixture(async (directory) => {
    const generations = [];
    for (const pass of [1, 2]) {
      const root = path.join(directory, `run-${pass}`);
      await cp(
        path.join(sourceDirectory, routerConfig.routesDirectory),
        path.join(root, routerConfig.routesDirectory),
        {
          recursive: true,
        },
      );
      const config = getConfig(
        {
          ...routerConfig,
          disableLogging: true,
          tmpDir: path.join(root, '.tanstack', 'tmp'),
        },
        root,
      );
      await new Generator({ config, root }).run();
      generations.push(await readFile(config.generatedRouteTree));
    }

    assert.deepEqual(generations[1], generations[0], 'Route generation must be byte reproducible');
    assert.deepEqual(
      generations[0],
      committed,
      'routeTree.gen.ts is stale; regenerate it with the dashboard UI build',
    );
  });
}

async function addRoute(directory, file, routePath) {
  const destination = path.join(directory, routerConfig.routesDirectory, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(
    destination,
    `import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('${routePath}')({ component: () => null });\n`,
  );
}

test('fresh grouped-dashboard generation is reproducible and preserves the public root URL', async () => {
  await checkGeneratedRoutes(appDirectory);
  const generated = await readFile(
    path.join(appDirectory, routerConfig.generatedRouteTree),
    'utf8',
  );
  assert.match(generated, /from ['"]\.\/routes\/\(dashboard\)\/index['"]/);
  assert.match(generated, /fullPaths: ['"]\/['"]/);
  assert.doesNotMatch(generated, /['"]\/dashboard\/?['"]/);
});

test('the generation check rejects deliberately stale committed bytes', async () => {
  await withFixture(async (directory) => {
    await copyAppRoutes(directory);
    await appendFile(path.join(directory, routerConfig.generatedRouteTree), '\n// stale fixture\n');
    await assert.rejects(checkGeneratedRoutes(directory), /routeTree\.gen\.ts is stale/);
  });
});

test('stories, tests, mocks, and ignored support files are excluded by the shared route policy', async () => {
  await withFixture(async (directory) => {
    await copyAppRoutes(directory);
    const ignoredFiles = [
      'fixture.test.tsx',
      'fixture.spec.tsx',
      'fixture.stories.tsx',
      'test/fixture.tsx',
      '__tests__/fixture.tsx',
      'mocks/fixture.tsx',
      'testing/fixture.tsx',
      '-fixture.tsx',
      'nested/mocks/fixture.tsx',
      '(dashboard)/-components/Fixture/Fixture.tsx',
      '(dashboard)/-components/Fixture/components/Child/Child.tsx',
      '(dashboard)/-components/Fixture/contexts/FixtureContext/FixtureContext.tsx',
      '(dashboard)/-hooks/useFixture/Fixture.tsx',
      '(dashboard)/-state/fixture.tsx',
      '(dashboard)/nested/fixture.test.tsx',
      '(dashboard)/nested/fixture.spec.tsx',
      '(dashboard)/nested/fixture.stories.tsx',
      '(dashboard)/nested/mocks/fixture.tsx',
    ];
    for (const [index, file] of ignoredFiles.entries()) {
      await addRoute(directory, file, `/ignored-fixture-${index}`);
    }
    await checkGeneratedRoutes(directory);
  });
});

test('a new nested ordinary route makes the unchanged committed tree stale', async () => {
  await withFixture(async (directory) => {
    await copyAppRoutes(directory);
    await addRoute(directory, 'nested/generated-probe.tsx', '/nested/generated-probe');
    await assert.rejects(checkGeneratedRoutes(directory), /routeTree\.gen\.ts is stale/);
  });
});
