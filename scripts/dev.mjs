import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
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
    const message =
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Another Pharo instance may be running. Use that instance, stop it with Ctrl+C in its terminal, or choose different ports: npm run dev -- --api-port 5081 --ui-port 5174. The existing process was left running.`
        : `Cannot listen on 127.0.0.1:${port} (${error.code ?? error.message}). Check local network permissions.`;

    throw new Error(message, { cause: error });
  } finally {
    if (listener.listening) await new Promise((resolve) => listener.close(resolve));
  }
}

function assertSdkAvailable(environment) {
  const result = spawnSync('dotnet', ['--version'], {
    cwd: rootDirectory,
    env: dotnetEnvironment(environment),
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `The .NET SDK ${requiredDotnetSdk} is required. Install it and add dotnet to your PATH; see README.md (Run locally).`,
      { cause: result.error },
    );
  }

  if (result.error || result.status !== 0 || result.stdout.trim() !== requiredDotnetSdk) {
    throw new Error(
      `Cannot select .NET SDK ${requiredDotnetSdk}. Install the SDK specified in global.json, then check dotnet --version from the repository root. See README.md (Run locally).`,
      { cause: result.error ?? new Error(result.stderr.trim()) },
    );
  }
}

/** Launch and retire only this invocation's API and UI process groups. */
export async function startDashboard(options = {}) {
  options.signal?.throwIfAborted();

  const preview = options.preview ?? false;
  const environment = { ...process.env, ...options.environment };
  const { apiPort, uiPort } = runtimePorts(environment, preview);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const uiUrl = `http://127.0.0.1:${uiPort}`;

  await assertPortAvailable(apiPort);
  await assertPortAvailable(uiPort);
  assertSdkAvailable(environment);
  options.signal?.throwIfAborted();

  const children = [];
  let stopping;
  let startupError;
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });

  const launch = (command, args, cwd, env) => {
    options.signal?.throwIfAborted();

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: options.stdio ?? 'inherit',
      detached: process.platform !== 'win32',
      windowsHide: true,
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
  };

  const signalOwned = async (record, signal) => {
    if (record.retired || record.child.pid === undefined) return;

    try {
      if (process.platform === 'win32') {
        if (record.closed) return;

        // Terminate the owned tree while its root still exists. child.kill() on
        // Windows terminates only the leader and can orphan the ASP.NET host.
        const terminator = spawn('taskkill.exe', ['/PID', String(record.child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 3000,
        });
        const [code] = await once(terminator, 'close');

        if (code !== 0 && !record.closed) {
          throw new Error(
            `Could not stop owned process tree ${record.child.pid} (taskkill ${code}).`,
          );
        }
      } else process.kill(-record.child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
    }
  };

  const stop = () => {
    if (stopping) return stopping;

    stopping = (async () => {
      const errors = [];
      const inspectionErrors = new Set();

      const signalAll = async (signal) => {
        await Promise.all(
          children.map(async (record) => {
            try {
              await signalOwned(record, signal);
            } catch (error) {
              errors.push(error);
            }
          }),
        );
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
        await signalAll('SIGTERM');
        if (!(await waitForShutdown(5000))) {
          await signalAll('SIGKILL');
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
  };

  const cancel = () => {
    void stop().catch(() => {});
  };

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
    const api = launch('dotnet', apiArgs, rootDirectory, dotnetEnvironment(environment));
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
        ...environment,
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

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  if (process.platform === 'win32') signals.push('SIGBREAK');
  for (const signal of signals) process.on(signal, close);

  try {
    const { values } = parseArgs({
      options: {
        preview: { type: 'boolean', default: false },
        'api-port': { type: 'string' },
        'ui-port': { type: 'string' },
      },
    });

    const environment = { ...process.env };
    if (values['api-port'] !== undefined) environment.PHARO_API_PORT = values['api-port'];
    if (values['ui-port'] !== undefined) environment.PHARO_UI_PORT = values['ui-port'];

    host = await startDashboard({
      preview: values.preview,
      environment,
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
    for (const signal of signals) process.removeListener(signal, close);
  }
}
