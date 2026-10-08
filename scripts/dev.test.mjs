import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, Server } from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startDashboard } from './dev.mjs';
import { rootDirectory, runtimePorts } from './runtime.mjs';

async function listener(port = 0) {
  const server = createServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert(address && typeof address === 'object');

  return {
    port: address.port,
    close: () => new Promise((resolve) => server.close(resolve)),
    server,
  };
}

async function availablePorts() {
  const api = await listener();
  let ui;

  try {
    ui = await listener();
    return { PHARO_API_PORT: String(api.port), PHARO_UI_PORT: String(ui.port) };
  } finally {
    await api.close();
    if (ui) await ui.close();
  }
}

async function assertReleased(environment) {
  for (const port of Object.values(environment)) {
    const probe = await listener(Number(port));
    await probe.close();
  }
}

test('validates distinct usable loopback ports', () => {
  assert.throws(() => runtimePorts({ PHARO_API_PORT: 'not-a-port' }));
  assert.throws(() => runtimePorts({ PHARO_API_PORT: '8000', PHARO_UI_PORT: '8000' }));
});

test('an already cancelled launch does not start a listener', async () => {
  const environment = await availablePorts();
  const reason = new Error('Cancelled before startup');

  await assert.rejects(
    startDashboard({ preview: true, environment, signal: AbortSignal.abort(reason) }),
    (error) => error === reason,
  );

  await assertReleased(environment);
});

test('either occupied port blocks startup and leaves the unrelated owner alive', async () => {
  for (const variable of ['PHARO_API_PORT', 'PHARO_UI_PORT']) {
    const environment = await availablePorts();
    const occupied = await listener(Number(environment[variable]));

    try {
      await assert.rejects(startDashboard({ preview: true, environment }), /already in use/);
      assert.equal(occupied.server.listening, true);
    } finally {
      await occupied.close();
    }

    await assertReleased(environment);
  }
});

test('a permission error is not reported as another server', async (context) => {
  const denied = Object.assign(new Error('Permission denied'), { code: 'EPERM' });

  context.mock.method(Server.prototype, 'listen', function () {
    queueMicrotask(() => this.emit('error', denied));
    return this;
  });

  await assert.rejects(startDashboard(), (error) => {
    assert.match(error.message, /EPERM.*permissions/);
    assert.doesNotMatch(error.message, /already in use|existing process/);
    assert.strictEqual(error.cause, denied);

    return true;
  });
});

test('missing dotnet fails before either host starts', async () => {
  const environment = await availablePorts();

  await assert.rejects(
    startDashboard({ environment: { ...environment, PATH: '', Path: '' } }),
    /\.NET SDK .* required.*PATH/,
  );

  await assertReleased(environment);
});

test(
  'compiled hosts proxy requests and repeated stop releases their ports',
  { timeout: 45000 },
  async () => {
    const environment = await availablePorts();
    const host = await startDashboard({ preview: true, environment, stdio: 'ignore' });

    try {
      const readiness = await fetch(host.uiUrl + '/health');
      assert.deepEqual(await readiness.json(), { status: 'ready' });
      assert.match(
        await (await fetch(host.uiUrl)).text(),
        /<title>Pharo \| Instrument Analytics<\/title>/,
      );

      const duplicate = spawnSync(
        process.execPath,
        [
          'scripts/dev.mjs',
          '--preview',
          '--api-port',
          environment.PHARO_API_PORT,
          '--ui-port',
          environment.PHARO_UI_PORT,
        ],
        { cwd: rootDirectory, encoding: 'utf8', timeout: 10000 },
      );

      assert.equal(duplicate.status, 1, duplicate.stderr);
      assert.match(duplicate.stderr, /already in use.*existing process was left running/);
      assert.deepEqual(await (await fetch(host.uiUrl + '/health')).json(), { status: 'ready' });
    } finally {
      const firstStop = host.stop();
      assert.strictEqual(host.stop(), firstStop);
      await firstStop;
    }

    await assertReleased(environment);
  },
);

test(
  'closing a terminal releases both CLI hosts and permits an immediate restart',
  { timeout: 60000, skip: process.platform === 'win32' },
  async () => {
    const environment = await availablePorts();

    const child = spawn(
      process.execPath,
      [
        'scripts/dev.mjs',
        '--preview',
        '--api-port',
        environment.PHARO_API_PORT,
        '--ui-port',
        environment.PHARO_UI_PORT,
      ],
      { cwd: rootDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const exited = once(child, 'close');
    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));

    try {
      const deadline = Date.now() + 30000;

      while (!output.includes(`UI:  http://127.0.0.1:${environment.PHARO_UI_PORT}`)) {
        assert.equal(child.exitCode, null, output);
        assert(Date.now() < deadline, output);
        await delay(50);
      }

      child.kill('SIGHUP');
      const [code] = await exited;

      assert.equal(code, 0, output);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await exited;
    }

    await assertReleased(environment);

    const restarted = await startDashboard({ preview: true, environment, stdio: 'ignore' });
    await restarted.stop();

    await assertReleased(environment);
  },
);

test(
  'development hosts start with dotnet run and Vite, proxy requests, and retire',
  { timeout: 60000 },
  async () => {
    const environment = await availablePorts();
    const host = await startDashboard({ preview: false, environment, stdio: 'ignore' });

    try {
      const readiness = await fetch(host.uiUrl + '/health');
      assert.deepEqual(await readiness.json(), { status: 'ready' });
      assert.match(
        await (await fetch(host.uiUrl)).text(),
        /<title>Pharo \| Instrument Analytics<\/title>/,
      );
    } finally {
      await host.stop();
    }

    await assertReleased(environment);
  },
);

test(
  'readiness retains staggered successful probes and releases every response body',
  { timeout: 45000 },
  async (context) => {
    const environment = await availablePorts();
    const apiUrl = `http://127.0.0.1:${environment.PHARO_API_PORT}/health`;
    const uiUrl = `http://127.0.0.1:${environment.PHARO_UI_PORT}`;
    const nativeFetch = globalThis.fetch;
    const released = [];
    let apiReady = false;
    let rejectedUiProbe = false;
    let repeatedApiProbe = false;
    let host;

    const probe = context.mock.method(globalThis, 'fetch', async (url, options) => {
      if (url === apiUrl && apiReady) {
        repeatedApiProbe = true;
        throw new Error('The already-ready API need not pass again beside a later UI probe.');
      }

      if (url === uiUrl && !apiReady) {
        throw new Error('Hold UI readiness until the API has passed independently.');
      }

      const response = await nativeFetch(url, options);
      if (url === apiUrl && response.ok) apiReady = true;

      if (response.body) {
        const cancel = response.body.cancel.bind(response.body);
        context.mock.method(response.body, 'cancel', async () => {
          released.push(url);
          await cancel();
        });
      }

      if (url === uiUrl && response.ok && !rejectedUiProbe) {
        rejectedUiProbe = true;
        // Keep the real response stream but make one completed probe unsuccessful.
        context.mock.getter(response, 'ok', () => false);
      }

      return response;
    });

    try {
      host = await startDashboard({ preview: true, environment, stdio: 'ignore' });

      assert.equal(repeatedApiProbe, false);
      assert.equal(rejectedUiProbe, true);
      assert.deepEqual(released, [apiUrl, uiUrl, uiUrl]);

      probe.mock.restore();
      assert.deepEqual(await (await nativeFetch(host.uiUrl + '/health')).json(), {
        status: 'ready',
      });
    } finally {
      probe.mock.restore();
      await host?.stop();
    }

    await assertReleased(environment);
  },
);

test('cancellation after readiness retires both actual hosts', { timeout: 45000 }, async () => {
  const environment = await availablePorts();
  const cancellation = new AbortController();
  const host = await startDashboard({
    preview: true,
    environment,
    stdio: 'ignore',
    signal: cancellation.signal,
  });

  try {
    cancellation.abort(new Error('Requested shutdown'));
    await host.exited;
  } finally {
    await host.stop();
  }

  await assertReleased(environment);
});

test(
  'startup cancellation cleans up before returning its rejection',
  { timeout: 45000 },
  async () => {
    const environment = await availablePorts();
    const cancellation = new AbortController();
    const reason = new Error('Cancelled during startup');
    const starting = startDashboard({
      preview: true,
      environment,
      stdio: 'ignore',
      signal: cancellation.signal,
    });
    const abort = setTimeout(() => cancellation.abort(reason), 10);

    try {
      // If unusually fast hosts are ready already, the same signal still owns cleanup.
      const host = await starting.catch((error) => {
        assert.strictEqual(error, reason);
        return undefined;
      });

      if (host) {
        cancellation.abort(reason);
        await host.stop();
      }
    } finally {
      clearTimeout(abort);
    }

    await assertReleased(environment);
  },
);

test(
  'an unexpected UI exit closes the API and preserves an unrelated listener',
  { timeout: 45000 },
  async () => {
    const environment = await availablePorts();
    const unrelated = await listener();
    let host;

    try {
      host = await startDashboard({ preview: true, environment, stdio: 'ignore' });
      assert.equal(typeof host.processIds.ui, 'number');
      process.kill(host.processIds.ui, 'SIGTERM');
      await host.exited;
      await host.stop();

      await assertReleased(environment);
      assert.equal(unrelated.server.listening, true);
    } finally {
      await Promise.all([host?.stop(), unrelated.close()]);
    }
  },
);

test(
  'a failed release still attempts the other host and the forced cleanup',
  {
    timeout: 45000,
    skip: process.platform === 'win32',
  },
  async (context) => {
    const environment = await availablePorts();
    const host = await startDashboard({ preview: true, environment, stdio: 'ignore' });
    const originalKill = process.kill;
    const attempts = [];
    let rejectedTerm = false;

    const kill = context.mock.method(process, 'kill', (pid, signal) => {
      attempts.push({ pid, signal });
      if (pid === -host.processIds.api && signal === 'SIGTERM' && !rejectedTerm) {
        rejectedTerm = true;
        throw Object.assign(new Error('Injected termination failure'), { code: 'EPERM' });
      }

      return originalKill.call(process, pid, signal);
    });

    try {
      await assert.rejects(host.stop(), AggregateError);
      assert(
        attempts.some(({ pid, signal }) => pid === -host.processIds.ui && signal === 'SIGTERM'),
      );
      assert(
        attempts.some(({ pid, signal }) => pid === -host.processIds.api && signal === 'SIGKILL'),
      );
    } finally {
      kill.mock.restore();
      await host.stop().catch(() => {});
    }

    await assertReleased(environment);
  },
);
