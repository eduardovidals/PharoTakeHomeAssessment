import axios from 'axios';
import { HttpResponse, http } from 'msw';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { server } from '../test/mocks/server';
import { createApiClient, isApiFailure, requestJson } from './client';

const endpoint = 'http://localhost/api/client-witness';
const schema = z.strictObject({ value: z.number() });

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized.');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('constructs an isolated strict JSON client with production defaults', () => {
  const priorBase = axios.defaults.baseURL;
  const first = createApiClient();
  const second = createApiClient();
  expect(first).not.toBe(second);
  expect(first.defaults.baseURL).toBe('/api');
  expect(first.defaults.timeout).toBe(10000);
  expect(first.defaults.responseType).toBe('json');
  expect(first.defaults.transitional?.silentJSONParsing).toBe(false);
  expect(first.defaults.transitional?.clarifyTimeoutError).toBe(true);
  expect(axios.defaults.baseURL).toBe(priorBase);
});

test.each([
  '',
  'api',
  '//example.com/api',
  '/api?key=hidden',
  '/api#part',
  'https://user:secret@example.com/api',
  'file:///tmp/data',
  'http:example.com/api',
  'http:/example.com/api',
  'https://example.com/api?',
  ' /api',
  '/api\\\\other',
  'https://example.com/api#',
])('rejects unsafe base configuration before I/O: %s', (baseURL) => {
  expect(() => createApiClient({ baseURL })).toThrow('Invalid API client configuration.');
});

test.each([0, -1, NaN, Infinity])('rejects invalid timeout %s', (timeoutMs) => {
  expect(() => createApiClient({ timeoutMs })).toThrow(TypeError);
});

test('validates unknown response JSON before returning data', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ value: 7 })));
  await expect(
    requestJson(createApiClient({ baseURL: 'http://localhost/api' }), '/client-witness', schema),
  ).resolves.toEqual({ value: 7 });
});

test.each([
  { status: 404, kind: 'not-found', message: 'Instrument not found.' },
  { status: 403, kind: 'http', message: 'The service could not complete the request.' },
  { status: 503, kind: 'http', message: 'The service could not complete the request.' },
])(
  'preserves $status even when the error body is malformed JSON',
  async ({ status, kind, message }) => {
    server.use(
      http.get(
        endpoint,
        () =>
          new HttpResponse('{ secret-body', {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const error: unknown = await requestJson(
      createApiClient({ baseURL: 'http://localhost/api' }),
      '/client-witness',
      schema,
    ).catch((failure: unknown) => failure);
    expect(error).toEqual({ kind, status, message });
    expect(isApiFailure(error)).toBe(true);
    expect(JSON.stringify(error)).not.toContain('secret-body');
  },
);

test('rejects malformed successful JSON with safe plain metadata', async () => {
  server.use(
    http.get(
      endpoint,
      () =>
        new HttpResponse('{ malformed', {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  const error: unknown = await requestJson(
    createApiClient({ baseURL: 'http://localhost/api' }),
    '/client-witness',
    schema,
  ).catch((failure: unknown) => failure);
  expect(error).toEqual({
    kind: 'invalid-response',
    status: 200,
    message: 'The service returned an invalid response.',
  });
  expect(error).not.toBeInstanceOf(Error);
  expect(isApiFailure(error)).toBe(true);
});

test('rejects successful JSON with an incorrect schema', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ value: '7', extra: true })));
  await expect(
    requestJson(createApiClient({ baseURL: 'http://localhost/api' }), '/client-witness', schema),
  ).rejects.toEqual({
    kind: 'invalid-response',
    message: 'The service returned an invalid response.',
  });
});

test('distinguishes an intentional network failure', async () => {
  server.use(http.get(endpoint, () => HttpResponse.error()));
  await expect(
    requestJson(createApiClient({ baseURL: 'http://localhost/api' }), '/client-witness', schema),
  ).rejects.toEqual({ kind: 'network', message: 'The service could not be reached.' });
});

test('consumes the actual signal and drains its held request after cancellation', async () => {
  const started = deferred();
  const release = deferred();
  const settled = deferred();
  const controller = new AbortController();
  const client = createApiClient({ baseURL: 'http://localhost/api' });
  const abortSpy = vi.spyOn(XMLHttpRequest.prototype, 'abort');
  let aborted = false;
  let capturedSignal: unknown;
  const onAbort = () => {
    aborted = true;
  };
  const interceptor = client.interceptors.request.use((config) => {
    capturedSignal = config.signal;
    config.signal?.addEventListener?.('abort', onAbort, { once: true });
    return config;
  });
  server.use(
    http.get(endpoint, async () => {
      started.resolve();
      try {
        await release.promise;
        return HttpResponse.json({ value: 9 });
      } finally {
        settled.resolve();
      }
    }),
  );
  const outcome = requestJson(client, '/client-witness', schema, controller.signal).catch(
    (error: unknown) => error,
  );
  try {
    await started.promise;
    expect(capturedSignal).toBe(controller.signal);
    controller.abort();
    await expect(outcome).resolves.toEqual({ kind: 'cancelled', message: 'Request cancelled.' });
    expect(aborted).toBe(true);
    // MSW's XHR bridge omits Request.signal; this spy calls the real XHR abort.
    expect(abortSpy).toHaveBeenCalledOnce();
  } finally {
    controller.abort();
    release.resolve();
    await settled.promise;
    await outcome;
    client.interceptors.request.eject(interceptor);
    controller.signal.removeEventListener('abort', onAbort);
    abortSpy.mockRestore();
  }
});

test('distinguishes an actual clarified timeout and drains its held handler', async () => {
  const started = deferred();
  const release = deferred();
  const settled = deferred();
  server.use(
    http.get(endpoint, async () => {
      started.resolve();
      try {
        await release.promise;
        return HttpResponse.json({ value: 1 });
      } finally {
        settled.resolve();
      }
    }),
  );
  const client = createApiClient({ baseURL: 'http://localhost/api', timeoutMs: 250 });
  // MSW's held XHR resolver does not start native timers; fetch has a real Axios deadline.
  client.defaults.adapter = 'fetch';
  const outcome = requestJson(client, '/client-witness', schema).catch((error: unknown) => error);
  try {
    await started.promise;
    await expect(outcome).resolves.toEqual({ kind: 'timeout', message: 'The request timed out.' });
  } finally {
    release.resolve();
    await settled.promise;
    await outcome;
  }
});

test('recognizes only the plain fixed failure shape, without leaked metadata', () => {
  expect(isApiFailure({ kind: 'timeout', message: 'The request timed out.' })).toBe(true);
  for (const value of [
    new Error('The request timed out.'),
    null,
    'timeout',
    { kind: 'timeout', message: 'raw request /secret' },
    { kind: 'network', message: 'The service could not be reached.', config: {} },
    { kind: 'http', message: 'The service could not complete the request.', status: 900 },
  ])
    expect(isApiFailure(value)).toBe(false);
});
