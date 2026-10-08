import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { rootDirectory } from './runtime.mjs';

const packages = [
  'react-components',
  'react-charts',
  'tailwind-plugin',
  'eslint-config',
  'prettier-config',
];

for (const name of packages) {
  const manifest = JSON.parse(readFileSync(`packages/pharo-${name}/package.json`, 'utf8'));
  assert.equal(manifest.name, `@pharo/${name}`);
}

const nxScript = path.join(rootDirectory, 'scripts/nx.mjs');
const result = spawnSync(process.execPath, [nxScript, 'show', 'projects', '--json'], {
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.error?.message);

const actual = JSON.parse(result.stdout);
assert.deepEqual(
  actual.toSorted(),
  [
    'pharo-dashboard-ui',
    'pharo-dashboard-api',
    ...packages.map((name) => `@pharo/${name}`),
  ].toSorted(),
  'Project discovery must contain exactly the seven public owners',
);

console.log('Workspace contains exactly the seven public projects.');

// run-many skips missing targets; assert each currently required lane before running it.
const requiredTargets = {
  'pharo-dashboard-ui': ['typecheck', 'test', 'build', 'infrastructure', 'e2e'],
  'pharo-dashboard-api': ['compile', 'format', 'test', 'build'],
  '@pharo/eslint-config': ['test'],
  '@pharo/prettier-config': ['test'],
  '@pharo/tailwind-plugin': ['typecheck', 'test'],
  '@pharo/react-components': [
    'build',
    'typecheck',
    'test',
    'test:unit',
    'test:stories',
    'e2e',
    'typecheck:catalog',
    'storybook',
    'storybook:build',
  ],
  '@pharo/react-charts': [
    'build',
    'typecheck',
    'test',
    'test:unit',
    'test:stories',
    'e2e',
    'typecheck:catalog',
    'storybook',
    'storybook:build',
  ],
};

for (const [project, names] of Object.entries(requiredTargets)) {
  const inspected = spawnSync(process.execPath, [nxScript, 'show', 'project', project, '--json'], {
    encoding: 'utf8',
  });

  assert.equal(inspected.status, 0, inspected.stderr || inspected.error?.message);

  const { targets } = JSON.parse(inspected.stdout);
  for (const name of names) {
    const target = targets?.[name];
    assert.ok(target?.executor || target?.command, `${project}:${name} must be executable`);
  }
}

console.log('Every required validation and catalog target is executable.');
