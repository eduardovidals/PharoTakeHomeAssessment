import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { browserEnvironment, rootDirectory } from './runtime.mjs';

// Set the shared browser cache before Vitest loads browser providers or stories.
const result = spawnSync(
  process.execPath,
  [path.join(rootDirectory, 'node_modules/vitest/vitest.mjs'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...browserEnvironment(), STORYBOOK_DISABLE_TELEMETRY: '1' } },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
