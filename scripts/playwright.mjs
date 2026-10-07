import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { browserEnvironment, rootDirectory } from './runtime.mjs';

// Browser installation and direct test execution share the ordinary public cache.
const result = spawnSync(
  process.execPath,
  [path.join(rootDirectory, 'node_modules/playwright/cli.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: browserEnvironment() },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
