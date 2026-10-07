import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer, normalizePath } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const ui = path.join(root, 'apps/pharo-dashboard-ui');
const protectedPaths = [
  '.env',
  '.env.local',
  'client.pem',
  '.npmrc',
  '.yarnrc.yml',
  '.git/config',
  '.dev-private/sentinel.txt',
  '.factory-agent/sentinel.txt',
  '.private/sentinel.txt',
  '.reference/sentinel.txt',
  '.private-skills/sentinel.txt',
  'AGENTS.override.md',
];

test('Actual UI Vite configuration serves public HTML and denies private fixture bytes', async () => {
  const cache = path.join(ui, 'node_modules/.cache');
  await mkdir(cache, { recursive: true });
  const fixture = await mkdtemp(path.join(cache, 'pharo-ui-privacy-'));
  const identity = await lstat(fixture);
  const sentinel = `pharo-private-check-${randomUUID()}`;
  const publicControl = `pharo-public-check-${randomUUID()}`;
  const relativeFixture = normalizePath(path.relative(ui, fixture));
  const fsUrl = (file) => `/@fs/${normalizePath(file).replace(/^\/+/, '')}`;
  const failures = [];
  let server;

  try {
    for (const file of protectedPaths) {
      const destination = path.join(fixture, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, sentinel);
    }
    await writeFile(path.join(fixture, 'public-control.txt'), publicControl);

    server = await createServer({
      configFile: path.join(ui, 'vite.config.ts'),
      root: ui,
      envDir: false,
      cacheDir: path.join(fixture, 'vite-cache'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const request = (url) => fetch(`${base}${url}`, { signal: AbortSignal.timeout(5000) });

    const index = await request('/');
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /<div\s+id="root"/);
    assert.match(html, /\/src\/main\.tsx/);
    assert.match(html, /@vite\/client/);
    assert.equal(html.includes(sentinel), false);

    const publicFile = await request(fsUrl(path.join(fixture, 'public-control.txt')));
    assert.equal(publicFile.status, 200);
    assert.equal(await publicFile.text(), publicControl);

    for (const file of protectedPaths) {
      for (const url of [`/${relativeFixture}/${file}`, fsUrl(path.join(fixture, file))]) {
        const response = await request(url);
        assert.equal(response.status, 403, url);
        assert.equal((await response.text()).includes(sentinel), false, url);
      }
    }
  } catch (error) {
    failures.push(error);
  }

  try {
    await server?.close();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 0) {
    try {
      const current = await lstat(fixture);
      assert.ok(current.isDirectory() && !current.isSymbolicLink());
      assert.equal(current.dev, identity.dev, 'Fixture device ownership changed');
      assert.equal(current.ino, identity.ino, 'Fixture directory ownership changed');
      // Vite may finish a dependency-cache rename just after close resolves.
      await rm(fixture, { recursive: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `UI privacy fixture failed; inspect ${fixture}`);
  }
});
