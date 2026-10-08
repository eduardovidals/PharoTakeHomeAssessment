import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserEnvironment } from './runtime.mjs';

// Local tasks never start a persistent daemon or contact a remote build cache.
// Run the JavaScript entrypoint directly; Windows package-manager shims need a shell.
const result = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.resolve('nx')), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...browserEnvironment(),
      NX_DAEMON: 'false',
      NX_NO_CLOUD: 'true',
      NX_SKIP_NX_CACHE: 'true',
    },
  },
);

if (result.error) console.error(result.error.message);

process.exit(result.status ?? 1);
