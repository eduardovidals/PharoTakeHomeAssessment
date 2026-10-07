import { act, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { HttpResponse, http } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';
import { server } from '../test/mocks/server';
import { bootstrapApplication } from './bootstrap';
import * as queryClients from './queryClient';
import * as appRouters from './router';
import type { AppInstance } from './types';

beforeEach(() => {
  server.use(http.get('http://localhost/api/instruments', () => HttpResponse.json(['AAA', 'BBB'])));
});

async function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  let app: AppInstance | undefined;
  try {
    await act(async () => {
      app = await bootstrapApplication(element, {
        history: createMemoryHistory({ initialEntries: ['/'] }),
        apiConfig: { baseURL: 'http://localhost/api' },
      });
    });
    if (!app) throw new Error('Application did not mount');
    return { element, app };
  } catch (error) {
    element.remove();
    throw error;
  }
}

test('mounts isolated real provider/router graphs and retires only its own instance', async () => {
  const first = await mount();
  const second = await mount();
  try {
    expect(
      await within(first.element).findByRole('heading', { name: 'Instrument price dashboard' }),
    ).toBeVisible();
    expect(first.app.router.options.context.queryClient).toBe(first.app.queryClient);
    expect(first.app.router.options.context.apiClient).toBe(first.app.apiClient);
    expect(first.app.apiClient).not.toBe(second.app.apiClient);
    expect(first.app.queryClient).not.toBe(second.app.queryClient);
    expect(first.app.history).not.toBe(second.app.history);
    await act(() => first.app.dispose());
    expect(first.element).toBeEmptyDOMElement();
    expect(
      within(second.element).getByRole('heading', { name: 'Instrument price dashboard' }),
    ).toBeVisible();
  } finally {
    await act(async () => {
      await Promise.all([first.app.dispose(), second.app.dispose()]);
    });
    first.element.remove();
    second.element.remove();
  }
});

test('shares pending disposal and awaits consumed cancellation before clearing or destroying', async () => {
  const { app, element } = await mount();
  let releaseCancellation: () => void = () => {
    throw new Error('Missing cancellation barrier');
  };
  const barrier = new Promise<void>((resolve) => {
    releaseCancellation = resolve;
  });
  const cancel = app.queryClient.cancelQueries.bind(app.queryClient);
  const cancelled = vi
    .spyOn(app.queryClient, 'cancelQueries')
    .mockImplementation(async (...args) => {
      await barrier;
      await cancel(...args);
    });
  const clear = vi.spyOn(app.queryClient, 'clear');
  const destroy = vi.spyOn(app.history, 'destroy');
  let aborted = false;
  const pending = app.queryClient
    .fetchQuery({
      queryKey: ['lifetime-witness'],
      queryFn: ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
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
  try {
    const disposal = app.dispose();
    expect(app.dispose()).toBe(disposal);
    await waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
    expect(element).toBeEmptyDOMElement();
    expect(clear).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    releaseCancellation();
    await disposal;
    await pending;
    expect(aborted).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    releaseCancellation();
    await app.dispose();
    await pending;
    element.remove();
  }
});

test('preserves startup failure and still releases acquired resources when cleanup also fails', async () => {
  const queryClient = queryClients.createAppQueryClient();
  vi.spyOn(queryClients, 'createAppQueryClient').mockReturnValue(queryClient);
  const cancel = vi.spyOn(queryClient, 'cancelQueries');
  const clear = vi.spyOn(queryClient, 'clear');
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const destroy = history.destroy.bind(history);
  const primary = new Error('Router acquisition failed');
  const secondary = new Error('History release failed');
  vi.spyOn(appRouters, 'createAppRouter').mockImplementation(() => {
    throw primary;
  });
  vi.spyOn(history, 'destroy').mockImplementation(() => {
    destroy();
    throw secondary;
  });
  let failure: unknown;
  try {
    await bootstrapApplication(document.createElement('div'), { history });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Expected both failures');
  expect(failure.cause).toBe(primary);
  expect(failure.errors[0]).toBe(primary);
  const cleanup: unknown = failure.errors[1];
  if (!(cleanup instanceof AggregateError)) throw new Error('Expected cleanup failure');
  expect(cleanup.errors).toEqual([secondary]);
  expect(cancel).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledOnce();
  expect(history.destroy).toHaveBeenCalledOnce();
});

test('owns injected history before configuration validation can fail', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const destroy = vi.spyOn(history, 'destroy');
  await expect(
    bootstrapApplication(document.createElement('div'), { history, apiConfig: { timeoutMs: 0 } }),
  ).rejects.toBeInstanceOf(TypeError);
  expect(destroy).toHaveBeenCalledOnce();
});

test('attempts all independent releases and preserves one terminal disposal failure', async () => {
  const { app, element } = await mount();
  const errors = [
    new Error('Unmount'),
    new Error('Cancellation'),
    new Error('Clear'),
    new Error('History'),
  ];
  const unmount = app.root.unmount.bind(app.root);
  const cancel = app.queryClient.cancelQueries.bind(app.queryClient);
  const clear = app.queryClient.clear.bind(app.queryClient);
  const destroy = app.history.destroy.bind(app.history);
  vi.spyOn(app.root, 'unmount').mockImplementation(() => {
    unmount();
    throw errors[0];
  });
  vi.spyOn(app.queryClient, 'cancelQueries').mockImplementation(async (...args) => {
    await cancel(...args);
    throw errors[1];
  });
  vi.spyOn(app.queryClient, 'clear').mockImplementation(() => {
    clear();
    throw errors[2];
  });
  vi.spyOn(app.history, 'destroy').mockImplementation(() => {
    destroy();
    throw errors[3];
  });
  try {
    const disposal = app.dispose();
    expect(app.dispose()).toBe(disposal);
    let failure: unknown;
    await act(async () => {
      try {
        await disposal;
      } catch (error) {
        failure = error;
      }
    });
    if (!(failure instanceof AggregateError)) throw new Error('Expected all cleanup failures');
    expect(failure.errors).toEqual(errors);
    expect(app.root.unmount).toHaveBeenCalledOnce();
    expect(app.queryClient.cancelQueries).toHaveBeenCalledOnce();
    expect(app.queryClient.clear).toHaveBeenCalledOnce();
    expect(app.history.destroy).toHaveBeenCalledOnce();
    await expect(app.dispose()).rejects.toBe(failure);
    expect(element).toBeEmptyDOMElement();
  } finally {
    element.remove();
  }
});
