import { describe, expect, test } from 'vitest';
import { getResourceFeedback } from './utils';
import type { ApiFailure } from '../../../../../../api/types';
import type { ComparisonColumn } from './types';

function failed(error: ApiFailure): ComparisonColumn['prices'] {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error,
    errorUpdateCount: 1,
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: true,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    status: 'error',
    fetchStatus: 'idle',
    refetch: async () => failed(error),
  };
}

describe('comparison resource feedback', () => {
  test.each([
    { kind: 'network', message: 'Network unavailable.' },
    { kind: 'timeout', message: 'Request timed out.' },
    { kind: 'http', status: 503, message: 'Server unavailable.' },
  ] satisfies ApiFailure[])('offers targeted retry for $kind', (error) => {
    expect(getResourceFeedback(failed(error), 'prices')).toEqual({
      message: `Prices: ${error.message}`,
      canRetry: true,
      notFound: false,
    });
  });

  test('cancellation is invisible and HTTP client/schema failures have no transient retry', () => {
    expect(
      getResourceFeedback(failed({ kind: 'cancelled', message: 'Cancelled.' }), 'statistics'),
    ).toEqual({ canRetry: false, notFound: false });
    expect(
      getResourceFeedback(
        failed({ kind: 'http', status: 400, message: 'Request unavailable.' }),
        'prices',
      ).canRetry,
    ).toBe(false);
    expect(
      getResourceFeedback(
        failed({ kind: 'invalid-response', message: 'Unexpected data.' }),
        'statistics',
      ).canRetry,
    ).toBe(false);
  });
});
