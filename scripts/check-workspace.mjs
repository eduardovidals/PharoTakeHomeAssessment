import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const packages = [
  'react-components',
  'react-form-components',
  'react-charts',
  'tailwind-plugin',
  'eslint-config',
  'prettier-config',
];
for (const name of packages) {
  const manifest = JSON.parse(readFileSync(`packages/pharo-${name}/package.json`, 'utf8'));
  assert.equal(manifest.name, `@pharo/${name}`);
}
const result = spawnSync('pnpm', ['exec', 'nx', 'show', 'projects', '--json'], {
  encoding: 'utf8',
  env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' },
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
  'Project discovery must contain exactly the eight public owners',
);
console.log('Workspace contains exactly the eight public projects.');

// run-many skips missing targets; assert each currently required lane before running it.
const requiredTargets = {
  'pharo-dashboard-ui': ['typecheck', 'test', 'build', 'infrastructure', 'e2e'],
  'pharo-dashboard-api': ['compile', 'test', 'build'],
  '@pharo/eslint-config': ['test'],
  '@pharo/prettier-config': ['test'],
  '@pharo/react-components': ['typecheck:catalog', 'storybook', 'storybook:build'],
  '@pharo/react-form-components': ['typecheck:catalog', 'storybook', 'storybook:build'],
  '@pharo/react-charts': ['typecheck:catalog', 'storybook', 'storybook:build'],
};
for (const [project, names] of Object.entries(requiredTargets)) {
  const inspected = spawnSync('pnpm', ['exec', 'nx', 'show', 'project', project, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' },
  });
  assert.equal(inspected.status, 0, inspected.stderr || inspected.error?.message);
  const { targets } = JSON.parse(inspected.stdout);
  for (const name of names) {
    const target = targets?.[name];
    assert.ok(target?.executor || target?.command, `${project}:${name} must be executable`);
  }
}
console.log('Every required validation and catalog target is executable.');
