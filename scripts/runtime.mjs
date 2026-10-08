import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const rootDirectory = path.resolve(import.meta.dirname, '..');
const portSchema = z.coerce.number().int().min(1024).max(65535);

/** Install and run browsers from the same cache, with an optional CI override. */
export function browserEnvironment() {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      path.join(rootDirectory, 'node_modules/.cache/ms-playwright'),
  };
}

/** Validate the two loopback listeners before either process starts. */
export function runtimePorts(environment = process.env, preview = false) {
  const apiPort = portSchema.parse(environment.PHARO_API_PORT ?? 5080);
  const uiPort = portSchema.parse(environment.PHARO_UI_PORT ?? (preview ? 4173 : 5173));
  if (apiPort === uiPort) throw new Error('API and UI ports must differ.');
  return { apiPort, uiPort };
}

/** Keep CLI state in the project's ignored dependency cache. */
export function dotnetEnvironment(environment = process.env) {
  const cache = path.join(rootDirectory, 'node_modules/.cache/dotnet');
  mkdirSync(cache, { recursive: true });
  return {
    ...environment,
    DOTNET_CLI_HOME: cache,
    NUGET_PACKAGES: path.join(cache, 'packages'),
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    DOTNET_NOLOGO: '1',
    MSBUILDDISABLENODEREUSE: '1',
  };
}
