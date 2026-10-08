import { spawnSync } from 'node:child_process';
import { dotnetEnvironment, rootDirectory } from './runtime.mjs';

const result = spawnSync('dotnet', process.argv.slice(2), {
  cwd: rootDirectory,
  stdio: 'inherit',
  env: dotnetEnvironment(),
});

if (result.error) console.error(result.error.message);

process.exit(result.status ?? 1);
