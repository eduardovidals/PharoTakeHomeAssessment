import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { z } from 'zod';

const port = z.coerce.number().int().min(1024).max(65535);
const uiPort = port.parse(process.env.PHARO_E2E_UI_PORT ?? 4190);
const apiPort = port.parse(process.env.PHARO_E2E_API_PORT ?? 5190);
if (uiPort === apiPort) {
  throw new Error('Playwright UI and API ports must differ.');
}
const baseURL = `http://127.0.0.1:${uiPort}`;
const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev.mjs --preview',
    cwd: root,
    url: baseURL,
    env: { PHARO_UI_PORT: String(uiPort), PHARO_API_PORT: String(apiPort) },
    reuseExistingServer: false,
    timeout: 30000,
    // The host independently retires its owned API/UI groups within eight seconds.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
  },
});
