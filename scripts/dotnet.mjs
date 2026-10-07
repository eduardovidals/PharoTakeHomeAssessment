import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, 'node_modules/.cache/dotnet');
mkdirSync(cache, { recursive: true });
// Keep native CLI state local and avoid first-run certificate/telemetry side effects.
const result = spawnSync('dotnet', process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DOTNET_CLI_HOME: cache,
    NUGET_PACKAGES: path.join(cache, 'packages'),
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    DOTNET_NOLOGO: '1',
    MSBUILDDISABLENODEREUSE: '1',
  },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
