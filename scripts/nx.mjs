import { spawnSync } from 'node:child_process';
import { browserEnvironment } from './runtime.mjs';

// Local tasks never start a persistent daemon or contact a remote build cache.
const result = spawnSync('pnpm', ['exec', 'nx', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...browserEnvironment(),
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_SKIP_NX_CACHE: 'true',
  },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
