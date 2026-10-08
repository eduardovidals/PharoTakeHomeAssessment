import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Opt-in visual walkthrough, separate from the normal E2E suite. No HTML report.
export default defineConfig(base, {
  testDir: './screenshots',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  outputDir: '../../node_modules/.cache/screenshot-test-results',
  use: {
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
