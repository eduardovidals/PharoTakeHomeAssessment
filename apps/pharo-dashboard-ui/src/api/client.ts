import axios from 'axios';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';
import type { ApiClient, ApiClientConfig, ApiFailure, ApiFailureKind } from './types';

const failureMessages: Record<ApiFailureKind, string> = {
  cancelled: 'Request cancelled.',
  'not-found': 'Instrument not found.',
  network: 'The service could not be reached.',
  timeout: 'The request timed out.',
  http: 'The service could not complete the request.',
  'invalid-response': 'The service returned an invalid response.',
};

function validBaseURL(value: string): boolean {
  if (!value || value !== value.trim() || /[\\\\?#\s]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function failure(kind: ApiFailureKind, status?: number): ApiFailure {
  return status === undefined
    ? { kind, message: failureMessages[kind] }
    : { kind, status, message: failureMessages[kind] };
}

function normalizeFailure(error: unknown, signal?: AbortSignal): ApiFailure {
  if (signal?.aborted || axios.isCancel(error)) return failure('cancelled');
  if (axios.isAxiosError<unknown>(error)) {
    if (error.code === 'ERR_CANCELED') return failure('cancelled');
    const status = error.response?.status;
    if (status !== undefined && (status < 200 || status >= 300)) {
      return failure(status === 404 ? 'not-found' : 'http', status);
    }
    if (error.code === 'ETIMEDOUT') return failure('timeout');
    if (error.code === 'ERR_BAD_RESPONSE') return failure('invalid-response', status);
    return failure('network', status);
  }
  if (error instanceof ZodError) return failure('invalid-response');
  return failure('invalid-response');
}

/**
 * Construct one owned client with strict JSON parsing and an explicit deadline.
 * Invalid programming configuration throws a fixed TypeError before any request.
 * @example
 * ```ts
 * const client = createApiClient();
 * ```
 */
export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const { baseURL = '/api', timeoutMs = 10000 } = config;
  if (
    typeof baseURL !== 'string' ||
    !validBaseURL(baseURL) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new TypeError('Invalid API client configuration.');
  }
  return axios.create({
    baseURL,
    timeout: timeoutMs,
    responseType: 'json',
    transitional: { silentJSONParsing: false, clarifyTimeoutError: true },
  });
}

/**
 * Request unknown JSON, validate its schema and reject with safe plain metadata.
 * The supplied signal reaches Axios; cancellation never becomes an empty success.
 * @example
 * ```ts
 * const result = await requestJson(client, '/instruments', instrumentsSchema, signal);
 * ```
 */
export async function requestJson<Output>(
  client: ApiClient,
  path: string,
  schema: ZodType<Output>,
  signal?: AbortSignal,
): Promise<Output> {
  try {
    const response = await client.get<unknown>(path, { signal });
    return schema.parse(response.data);
  } catch (error) {
    throw normalizeFailure(error, signal);
  }
}

/**
 * Narrow only the documented plain failure shape for safe rendering and retries.
 * @example
 * ```ts
 * if (isApiFailure(error) && error.kind === 'not-found') showMissingInstrument();
 * ```
 */
export function isApiFailure(value: unknown): value is ApiFailure {
  if (typeof value !== 'object' || value === null || !('kind' in value) || !('message' in value))
    return false;
  const entry = Object.entries(failureMessages).find(([kind]) => kind === value.kind);
  return (
    entry !== undefined &&
    value.message === entry[1] &&
    Object.keys(value).every((key) => key === 'kind' || key === 'message' || key === 'status') &&
    (!('status' in value) ||
      (typeof value.status === 'number' &&
        Number.isInteger(value.status) &&
        value.status >= 100 &&
        value.status <= 599)) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
