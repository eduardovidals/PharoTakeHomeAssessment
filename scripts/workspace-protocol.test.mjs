import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.join(import.meta.dirname, 'workspace-protocol.mjs');
const manifests = ['package.json', 'apps/ui/package.json', 'packages/components/package.json'];

async function withFixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pharo-workspace-protocol-'));
  const writeJson = async (file, value) => {
    const destination = path.join(directory, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`);
  };

  try {
    await writeJson('package.json', {
      name: 'fixture',
      private: true,
      packageManager: 'npm@11.12.1',
      engines: { node: '>=24.14.1 <25', npm: '11.12.1' },
      workspaces: ['apps/ui', 'packages/components'],
      scripts: { build: 'unchanged command' },
      dependencies: { '@fixture/components': '*', react: '19.3.0', '@unknown/package': '*' },
      devDependencies: { '@fixture/components': '*', '@unknown/dev': 'workspace:*' },
      peerDependencies: { '@fixture/components': '*', external: '^2.0.0' },
      optionalDependencies: { '@fixture/components': '*', optional: '~3.0.0' },
    });
    await writeJson('apps/ui/package.json', {
      name: '@fixture/ui',
      dependencies: { '@fixture/components': '*', '@unknown/components': '*' },
    });
    await writeJson('packages/components/package.json', {
      name: '@fixture/components',
      devDependencies: { '@fixture/ui': '^0.1.0' },
    });
    await writeJson('nx.json', { cli: { packageManager: 'npm' }, parallel: 2 });

    await run(directory, writeJson);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function switchMode(directory, mode) {
  return spawnSync(process.execPath, [script, mode], { cwd: directory, encoding: 'utf8' });
}

async function snapshot(directory) {
  return Promise.all(
    [...manifests, 'nx.json'].map((file) => readFile(path.join(directory, file), 'utf8')),
  );
}

test('switches all local protocol sections, preserves unrelated values and round-trips exactly', async () => {
  await withFixture(async (directory) => {
    const before = await snapshot(directory);
    const switched = switchMode(directory, 'pnpm');
    assert.equal(switched.status, 0, switched.stderr);

    const after = await snapshot(directory);
    const root = JSON.parse(after[0]);
    assert.equal(root.packageManager, 'pnpm@10.33.0');
    assert.deepEqual(root.engines, { node: '>=24.14.1 <25', pnpm: '10.33.0' });
    assert.deepEqual(root.scripts, { build: 'unchanged command' });
    assert.deepEqual(root.workspaces, ['apps/ui', 'packages/components']);

    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      assert.equal(root[section]['@fixture/components'], 'workspace:*');
    }

    assert.equal(root.dependencies.react, '19.3.0');
    assert.equal(root.dependencies['@unknown/package'], '*');
    assert.equal(root.devDependencies['@unknown/dev'], 'workspace:*');
    assert.equal(root.peerDependencies.external, '^2.0.0');
    assert.equal(root.optionalDependencies.optional, '~3.0.0');
    assert.equal(JSON.parse(after[1]).dependencies['@fixture/components'], 'workspace:*');
    assert.equal(JSON.parse(after[1]).dependencies['@unknown/components'], '*');
    assert.equal(JSON.parse(after[2]).devDependencies['@fixture/ui'], '^0.1.0');
    assert.deepEqual(JSON.parse(after[3]), { cli: { packageManager: 'pnpm' }, parallel: 2 });

    assert.equal(switchMode(directory, 'npm').status, 0);
    assert.deepEqual(await snapshot(directory), before);
  });
});

test('rerunning either selected mode leaves every byte unchanged', async () => {
  await withFixture(async (directory) => {
    for (const mode of ['npm', 'pnpm']) {
      assert.equal(switchMode(directory, mode).status, 0);

      const before = await snapshot(directory);
      const result = switchMode(directory, mode);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /No workspace files needed updates/);
      assert.deepEqual(await snapshot(directory), before);
    }
  });
});

test('does not discover ignored, generated or .NET directories', async () => {
  await withFixture(async (directory, writeJson) => {
    const ignored = [
      '.dev-private/package.json',
      'packages/unlisted/package.json',
      'apps/ui/node_modules/fixture/package.json',
    ];

    for (const file of ignored) {
      await writeJson(file, { name: '@private/fixture', dependencies: { '@fixture/ui': '*' } });
    }

    await mkdir(path.join(directory, 'apps/api'), { recursive: true });

    const before = await Promise.all(
      ignored.map((file) => readFile(path.join(directory, file), 'utf8')),
    );
    const result = switchMode(directory, 'pnpm');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      await Promise.all(ignored.map((file) => readFile(path.join(directory, file), 'utf8'))),
      before,
    );
  });
});

test('rejects a missing configured manifest before changing any existing file', async () => {
  await withFixture(async (directory) => {
    const before = await snapshot(directory);
    await rm(path.join(directory, 'packages/components/package.json'));

    const result = switchMode(directory, 'pnpm');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
    assert.equal(await readFile(path.join(directory, 'package.json'), 'utf8'), before[0]);
    assert.equal(await readFile(path.join(directory, 'apps/ui/package.json'), 'utf8'), before[1]);
    assert.equal(await readFile(path.join(directory, 'nx.json'), 'utf8'), before[3]);
  });
});

test('rejects broad/private membership and unknown modes without mutation', async () => {
  await withFixture(async (directory, writeJson) => {
    const initial = await snapshot(directory);
    assert.notEqual(switchMode(directory, 'yarn').status, 0);
    assert.deepEqual(await snapshot(directory), initial);

    for (const workspace of ['packages/*', '.dev-private/tooling', '../outside']) {
      const root = JSON.parse(initial[0]);
      root.workspaces.push(workspace);
      await writeJson('package.json', root);

      const before = await snapshot(directory);
      const result = switchMode(directory, 'pnpm');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /explicit public app\/package directories/);
      assert.deepEqual(await snapshot(directory), before);
    }
  });
});
