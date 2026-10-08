import { render } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderApp } from './renderApp';
import type { AppTest } from './renderApp';
import { server } from './mocks/server';

beforeEach(() => {
  server.use(http.get('http://localhost/api/instruments', () => HttpResponse.json(['AAA', 'BBB'])));
});

test('awaits query cancellation, clears its cache, and leaves an unrelated view mounted', async () => {
  const unrelated = render(<p>Unrelated application</p>);
  const app = await renderApp();

  let started = false;
  let aborted = false;
  const work = app.queryClient
    .fetchQuery({
      queryKey: ['pending-cleanup-witness'],
      queryFn: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          started = true;
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    })
    .catch((error: unknown) => error);

  expect(started).toBe(true);

  const disposal = app.dispose();

  expect(app.dispose()).toBe(disposal);

  await disposal;
  await work;

  expect(aborted).toBe(true);
  expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(app.container.isConnected).toBe(false);
  expect(unrelated.getByText('Unrelated application')).toBeVisible();

  unrelated.unmount();
});

test('cleans a partially rendered graph when its real router wrapper throws', async () => {
  const unrelated = render(<p>Unrelated startup view</p>);

  const primaryError = new Error('Provider startup failed');
  let acquired: AppTest | undefined;

  const FailedWrapper = (): never => {
    throw primaryError;
  };

  await expect(
    renderApp({
      configure: (app) => {
        acquired = app;
        app.queryClient.setQueryData(['startup-witness'], 42);
        vi.spyOn(app.view, 'unmount');
        vi.spyOn(app.queryClient, 'cancelQueries');
        vi.spyOn(app.queryClient, 'clear');
        vi.spyOn(app.history, 'destroy');
        vi.spyOn(app.container, 'remove');
        app.router.update({ Wrap: FailedWrapper, context: app.router.options.context });
      },
    }),
  ).rejects.toBe(primaryError);

  if (!acquired) {
    throw new Error('The graph did not reach its registered neutral view');
  }
  expect(acquired.view.unmount).toHaveBeenCalledOnce();
  expect(acquired.queryClient.cancelQueries).toHaveBeenCalledOnce();
  expect(acquired.queryClient.clear).toHaveBeenCalledOnce();
  expect(acquired.history.destroy).toHaveBeenCalledOnce();
  expect(acquired.container.remove).toHaveBeenCalledOnce();
  expect(acquired.queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(acquired.container.isConnected).toBe(false);
  expect(unrelated.getByText('Unrelated startup view')).toBeVisible();

  unrelated.unmount();
});

test('preserves the primary startup error together with cleanup failures', async () => {
  const primaryError = new Error('Configuration failed');
  const cleanupError = new Error('History release failed');
  let acquired: AppTest | undefined;
  let rejection: unknown;
  try {
    await renderApp({
      configure: (app) => {
        acquired = app;
        const destroy = app.history.destroy.bind(app.history);
        vi.spyOn(app.history, 'destroy').mockImplementation(() => {
          destroy();
          throw cleanupError;
        });
        throw primaryError;
      },
    });
  } catch (error) {
    rejection = error;
  }

  if (!(rejection instanceof AggregateError) || !acquired) {
    throw new Error('Expected preserved startup and cleanup failures');
  }
  expect(rejection.cause).toBe(primaryError);
  expect(rejection.errors[0]).toBe(primaryError);

  const cleanupFailure: unknown = rejection.errors[1];
  if (!(cleanupFailure instanceof AggregateError)) {
    throw new Error('Expected the original cleanup failure group');
  }
  expect(cleanupFailure.errors).toEqual([cleanupError]);
  expect(acquired.container.isConnected).toBe(false);
  await expect(acquired.dispose()).rejects.toBe(cleanupFailure);
});

test('attempts every independent release once and shares the terminal cleanup failure', async () => {
  const app = await renderApp();
  const unrelated = render(<p>Unrelated cleanup view</p>);
  app.queryClient.setQueryData(['cleanup-witness'], 42);
  const failures = [
    new Error('Unmount failed'),
    new Error('Cancellation failed'),
    new Error('Cache release failed'),
    new Error('History release failed'),
    new Error('Container release failed'),
  ];
  const [unmountError, cancelError, clearError, historyError, containerError] = failures;
  const unmount = app.view.unmount;
  const cancel = app.queryClient.cancelQueries.bind(app.queryClient);
  const clear = app.queryClient.clear.bind(app.queryClient);
  const destroy = app.history.destroy.bind(app.history);
  const remove = app.container.remove.bind(app.container);
  vi.spyOn(app.view, 'unmount').mockImplementation(() => {
    unmount();
    throw unmountError;
  });
  vi.spyOn(app.queryClient, 'cancelQueries').mockImplementation(async (...args) => {
    await cancel(...args);
    throw cancelError;
  });
  vi.spyOn(app.queryClient, 'clear').mockImplementation(() => {
    clear();
    throw clearError;
  });
  vi.spyOn(app.history, 'destroy').mockImplementation(() => {
    destroy();
    throw historyError;
  });
  vi.spyOn(app.container, 'remove').mockImplementation(() => {
    remove();
    throw containerError;
  });

  const disposal = app.dispose();

  expect(app.dispose()).toBe(disposal);

  let rejection: unknown;
  try {
    await disposal;
  } catch (error) {
    rejection = error;
  }
  if (!(rejection instanceof AggregateError)) {
    throw new Error('Expected all cleanup failures to be preserved');
  }
  expect(rejection.errors).toEqual(failures);
  expect(app.view.unmount).toHaveBeenCalledOnce();
  expect(app.queryClient.cancelQueries).toHaveBeenCalledOnce();
  expect(app.queryClient.clear).toHaveBeenCalledOnce();
  expect(app.history.destroy).toHaveBeenCalledOnce();
  expect(app.container.remove).toHaveBeenCalledOnce();
  expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(app.container.isConnected).toBe(false);
  expect(unrelated.getByText('Unrelated cleanup view')).toBeVisible();
  await expect(app.dispose()).rejects.toBe(rejection);

  unrelated.unmount();
});

test('uses the setup-owned MSW interceptor with an actual QueryClient request', async () => {
  let requests = 0;
  const endpoint = 'http://localhost/api/harness-witness';
  server.use(
    http.get(endpoint, () => {
      requests += 1;
      return HttpResponse.text('handled by the test server');
    }),
  );
  const app = await renderApp();

  const value = await app.queryClient.fetchQuery({
    queryKey: ['network-harness-witness', endpoint],
    queryFn: async ({ signal }) => {
      const response = await fetch(endpoint, { signal });
      if (!response.ok) {
        throw new Error(`Unexpected witness response: ${response.status}`);
      }
      return response.text();
    },
  });

  expect(value).toBe('handled by the test server');
  expect(requests).toBe(1);
  expect(app.queryClient.getQueryData(['network-harness-witness', endpoint])).toBe(value);

  await app.dispose();
});
