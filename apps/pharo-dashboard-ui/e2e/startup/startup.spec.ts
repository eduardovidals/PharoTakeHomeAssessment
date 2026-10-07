import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execute = promisify(execFile);
const rootDirectory = fileURLToPath(new URL('../../../../', import.meta.url));

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

interface PrivacySentinel {
  file: string;
  marker: string;
}

/** Own only this fixture, preserving any pre-existing private material and failures. */
async function withPrivacySentinel(run: (sentinel: PrivacySentinel) => Promise<void>) {
  const parent = join(rootDirectory, '.private');
  let ownsParent = false;
  let directory: string | undefined;
  let primaryError: unknown;
  let failed = false;
  try {
    try {
      await mkdir(parent);
      ownsParent = true;
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
      const existingParent = await lstat(parent);
      if (!existingParent.isDirectory() || existingParent.isSymbolicLink()) {
        throw new Error('The privacy fixture parent must be an ordinary directory.', {
          cause: error,
        });
      }
    }
    directory = await mkdtemp(join(parent, 'preview-'));
    const file = join(directory, 'sentinel.txt');
    const marker = `PHARO_PREVIEW_SENTINEL_${randomUUID()}`;
    await writeFile(file, marker, { flag: 'wx' });
    expect(await readFile(file, 'utf8')).toBe(marker);
    // A real ignored fixture establishes the prerequisite; no actual private source is read.
    await execute('git', ['check-ignore', '--quiet', '--', file], { cwd: rootDirectory });
    await run({ file, marker });
  } catch (error) {
    failed = true;
    primaryError = error;
  }

  const cleanupErrors: unknown[] = [];
  if (directory) {
    try {
      await rm(directory, { recursive: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (ownsParent) {
    try {
      await rmdir(parent);
    } catch (error) {
      // A concurrently acquired unrelated file keeps its parent; never remove it recursively.
      if (!hasCode(error, 'ENOTEMPTY') && !hasCode(error, 'ENOENT')) cleanupErrors.push(error);
    }
  }
  if (failed && cleanupErrors.length > 0) {
    throw new AggregateError([primaryError, ...cleanupErrors], 'Privacy test and cleanup failed', {
      cause: primaryError,
    });
  }
  if (failed) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Privacy fixture cleanup failed');
  }
}

// This lane exercises compiled UI and the actual C# host; market-data journeys follow with features.
test.describe('Open the local dashboard safely', () => {
  test('loads the compiled application and proxies the real API readiness endpoint', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Instrument price dashboard' })).toBeVisible();
    // e2e-locator: document-body colors establish inheritance for body-portaled controls.
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 247, 251)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(19, 36, 61)');
    const readiness = await page.request.get('/health');
    expect(readiness.status()).toBe(200);
    expect(await readiness.json()).toEqual({ status: 'ready' });
  });

  test('does not serve private files from the compiled preview', async ({ request }) => {
    await withPrivacySentinel(async ({ file, marker }) => {
      const ordinaryPath = relative(rootDirectory, file)
        .split(sep)
        .map(encodeURIComponent)
        .join('/');
      const absolutePath = file.split(sep).map(encodeURIComponent).join('/');
      for (const url of [`/${ordinaryPath}`, `/@fs${absolutePath}`, `/@fs/${absolutePath}`]) {
        const response = await request.get(url, { timeout: 5000 });
        const body = await response.text();
        expect(body, `Private sentinel leaked from ${url}`).not.toContain(marker);
        expect([200, 403, 404]).toContain(response.status());
        if (response.status() === 200) {
          // Preview may return its HTML SPA fallback, never the fixture's text bytes.
          expect(response.headers()['content-type']).toContain('text/html');
        }
      }
      const readiness = await request.get('/health', { timeout: 5000 });
      expect(readiness.status()).toBe(200);
      expect(await readiness.json()).toEqual({ status: 'ready' });
    });
  });
});
