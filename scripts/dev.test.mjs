import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import test from 'node:test';
import { startDashboard } from './dev.mjs';
import { runtimePorts } from './runtime.mjs';

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
      await assert.rejects(startDashboard({ preview: true, environment }), /unavailable/);
      assert.equal(occupied.server.listening, true);
    } finally {
      await occupied.close();
    }
    await assertReleased(environment);
  }
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
      assert.match(await (await fetch(host.uiUrl)).text(), /Instrument price dashboard/);
    } finally {
      const firstStop = host.stop();
      assert.strictEqual(host.stop(), firstStop);
      await firstStop;
    }
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
      assert.match(await (await fetch(host.uiUrl)).text(), /Instrument price dashboard/);
    } finally {
      await host.stop();
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
