import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { dotnetEnvironment, rootDirectory, runtimePorts } from './runtime.mjs';

const requiredDotnetSdk = JSON.parse(
  readFileSync(new URL('../global.json', import.meta.url), 'utf8'),
).sdk.version;

async function assertPortAvailable(port) {
  const listener = createServer();
  try {
    listener.listen(port, '127.0.0.1');
    await once(listener, 'listening');
  } catch (error) {
    throw new Error(`Port ${port} is unavailable; its existing owner was left running.`, {
      cause: error,
    });
  } finally {
    if (listener.listening) await new Promise((resolve) => listener.close(resolve));
  }
}

/** Launch and retire only this invocation's API and UI process groups. */
export async function startDashboard(options = {}) {
  options.signal?.throwIfAborted();
  const preview = options.preview ?? false;
  const { apiPort, uiPort } = runtimePorts(options.environment ?? process.env, preview);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const uiUrl = `http://127.0.0.1:${uiPort}`;
  await assertPortAvailable(apiPort);
  await assertPortAvailable(uiPort);
  options.signal?.throwIfAborted();
  const children = [];
  let stopping;
  let startupError;
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });

  function launch(command, args, cwd, env) {
    options.signal?.throwIfAborted();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: options.stdio ?? 'inherit',
      detached: process.platform !== 'win32',
    });
    const record = { child, closed: false, retired: false };
    child.once('error', (error) => {
      startupError ??=
        command === 'dotnet' && error.code === 'ENOENT'
          ? new Error(
              `The .NET SDK ${requiredDotnetSdk} is required. Install it and add dotnet to your PATH; see README.md (Run locally).`,
              { cause: error },
            )
          : error;
    });
    child.once('close', (code, signal) => {
      record.closed = true;
      resolveExit({ code, signal });
      if (!stopping) {
        startupError ??= new Error(`${command} exited before shutdown (${code ?? signal}).`);
        void stop().catch(() => {});
      }
    });
    children.push(record);
    return child.pid;
  }

  function signalOwned(record, signal) {
    if (record.retired || record.child.pid === undefined) return;
    try {
      if (process.platform === 'win32') {
        if (!record.closed) record.child.kill(signal);
      } else process.kill(-record.child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
    }
  }

  function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      const errors = [];
      const inspectionErrors = new Set();
      const signalAll = (signal) => {
        for (const record of children) {
          try {
            signalOwned(record, signal);
          } catch (error) {
            errors.push(error);
          }
        }
      };
      const waitForShutdown = async (timeout) => {
        const deadline = Date.now() + timeout;
        do {
          for (const record of children) {
            if (record.retired || !record.closed) continue;
            if (process.platform === 'win32' || record.child.pid === undefined) {
              record.retired = true;
              continue;
            }
            try {
              // A closed leader can still have descendants in its owned group.
              process.kill(-record.child.pid, 0);
            } catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
                record.retired = true;
              } else if (!inspectionErrors.has(record)) {
                inspectionErrors.add(record);
                errors.push(error);
              }
            }
          }
          if (children.every((record) => record.retired)) return true;
          await delay(25);
        } while (Date.now() < deadline);
        return false;
      };
      try {
        signalAll('SIGTERM');
        if (!(await waitForShutdown(5000))) {
          signalAll('SIGKILL');
          if (!(await waitForShutdown(3000))) {
            errors.push(new Error('An owned process did not close after shutdown.'));
          }
        }
        if (errors.length > 0) throw new AggregateError(errors, 'Dashboard cleanup failed.');
      } finally {
        options.signal?.removeEventListener('abort', cancel);
      }
    })();
    return stopping;
  }

  function cancel() {
    void stop().catch(() => {});
  }
  options.signal?.addEventListener('abort', cancel, { once: true });

  try {
    const apiArgs = preview
      ? ['apps/pharo-dashboard-api/dist/PharoDashboard.Api.dll', '--urls', apiUrl]
      : [
          'run',
          '--project',
          'apps/pharo-dashboard-api/PharoDashboard.Api.csproj',
          '--no-launch-profile',
          '--',
          '--urls',
          apiUrl,
        ];
    const api = launch('dotnet', apiArgs, rootDirectory, dotnetEnvironment());
    const ui = launch(
      process.execPath,
      [
        rootDirectory + '/node_modules/vite/bin/vite.js',
        ...(preview ? ['preview'] : []),
        '--host',
        '127.0.0.1',
        '--port',
        String(uiPort),
        '--strictPort',
      ],
      rootDirectory + '/apps/pharo-dashboard-ui',
      {
        ...process.env,
        PHARO_API_PORT: String(apiPort),
        PHARO_UI_PORT: String(uiPort),
      },
    );
    const deadline = Date.now() + (options.startupTimeoutMs ?? 30000);
    const pending = new Set([apiUrl + '/health', uiUrl]);
    while (true) {
      options.signal?.throwIfAborted();
      if (startupError) throw startupError;
      await Promise.all(
        [...pending].map(async (url) => {
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(500) });
            // Release every probe's stream, including unsuccessful HTTP responses.
            await response.body?.cancel();
            if (response.ok) pending.delete(url);
          } catch {
            // Retry only listeners not yet observed ready; child exits remain fatal.
          }
        }),
      );
      options.signal?.throwIfAborted();
      if (startupError) throw startupError;
      if (pending.size === 0) break;
      if (Date.now() >= deadline)
        throw new Error('API/UI startup did not become ready within its deadline.');
      await delay(100);
    }
    options.signal?.throwIfAborted();
    if (startupError) throw startupError;
    return { apiUrl, uiUrl, processIds: { api, ui }, stop, exited };
  } catch (error) {
    try {
      await stop();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Startup and cleanup failed.', { cause: cleanup });
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cancellation = new AbortController();
  let host;
  const close = () => {
    cancellation.abort(new Error('Dashboard shutdown requested.'));
    void host?.stop().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  try {
    host = await startDashboard({
      preview: process.argv.includes('--preview'),
      signal: cancellation.signal,
    });
    console.log(`API: ${host.apiUrl}\nUI:  ${host.uiUrl}`);
    const result = await host.exited;
    await host.stop();
    process.exitCode = cancellation.signal.aborted ? 0 : result.code || 1;
  } catch (error) {
    const cancelled = error === cancellation.signal.reason;
    if (!cancelled)
      console.error(error instanceof Error ? error.message : 'Dashboard startup failed.');
    process.exitCode = cancelled ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', close);
    process.removeListener('SIGTERM', close);
  }
}
