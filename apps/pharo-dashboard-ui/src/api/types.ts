import type { AxiosInstance } from 'axios';

/** Axios instance constructed once by its application or test owner. */
export type ApiClient = AxiosInstance;

/** Explicit API configuration; production uses the same-origin proxy. */
export interface ApiClientConfig {
  /** Root-relative path or HTTP(S) URL without credentials, query or fragment. */
  readonly baseURL?: string;
  /** Finite, strictly positive request deadline in milliseconds; defaults to10000. */
  readonly timeoutMs?: number;
}

/** Safe failure categories used by the application and central retry policy. */
export type ApiFailureKind =
  'cancelled' | 'not-found' | 'network' | 'timeout' | 'http' | 'invalid-response';

/** Plain feature-facing metadata without request configuration or response bodies. */
export interface ApiFailure {
  /** Distinguishes cancellation, unavailable transport and invalid server data. */
  readonly kind: ApiFailureKind;
  /** HTTP status only when an actual response supplied it. */
  readonly status?: number;
  /** Fixed readable message, never interpolated from the failed request. */
  readonly message: string;
}
