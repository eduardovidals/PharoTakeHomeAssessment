import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
const versions = { npm: '11.12.1', pnpm: '10.33.0' };
const dependencySections = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

if (mode !== 'npm' && mode !== 'pnpm') {
  console.error('Usage: node scripts/workspace-protocol.mjs <npm|pnpm>');
  process.exit(1);
}

const rootDirectory = process.cwd();
const rootManifest = await readJson('package.json');
const workspaces = rootManifest.workspaces;

if (
  !Array.isArray(workspaces) ||
  workspaces.length === 0 ||
  workspaces.some((workspace) => !/^(apps|packages)\/[a-z0-9-]+$/.test(workspace)) ||
  new Set(workspaces).size !== workspaces.length
) {
  throw new Error('workspaces must list unique, explicit public app/package directories.');
}

// Read every configured manifest before writing; never discover private or generated owners.
const manifests = [
  { file: 'package.json', value: rootManifest },
  ...(await Promise.all(
    workspaces.map(async (workspace) => {
      const file = `${workspace}/package.json`;

      return { file, value: await readJson(file) };
    }),
  )),
];
const nxConfig = await readJson('nx.json');
const localNames = new Set(manifests.map(({ value }) => value.name));

if (
  [...localNames].some((name) => typeof name !== 'string' || name.length === 0) ||
  localNames.size !== manifests.length
) {
  throw new Error('Each configured manifest must have a unique package name.');
}

const originals = new Map(
  [...manifests, { file: 'nx.json', value: nxConfig }].map(({ file, value }) => [
    file,
    JSON.stringify(value),
  ]),
);

for (const { value } of manifests) {
  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(value[section] ?? {})) {
      if (localNames.has(name) && (version === '*' || version === 'workspace:*')) {
        value[section][name] = mode === 'npm' ? '*' : 'workspace:*';
      }
    }
  }
}

rootManifest.packageManager = `${mode}@${versions[mode]}`;
rootManifest.engines ??= {};
delete rootManifest.engines[mode === 'npm' ? 'pnpm' : 'npm'];
rootManifest.engines[mode] = versions[mode];
nxConfig.cli ??= {};
nxConfig.cli.packageManager = mode;

const updatedFiles = [];

for (const { file, value } of [...manifests, { file: 'nx.json', value: nxConfig }]) {
  if (JSON.stringify(value) === originals.get(file)) continue;

  await writeFile(path.join(rootDirectory, file), `${JSON.stringify(value, null, 2)}\n`);
  updatedFiles.push(file);
}

console.log(
  updatedFiles.length === 0
    ? `No workspace files needed updates for ${mode}.`
    : `Updated workspace files for ${mode}:\n${updatedFiles.map((file) => `- ${file}`).join('\n')}`,
);

async function readJson(file) {
  return JSON.parse(await readFile(path.join(rootDirectory, file), 'utf8'));
}
