import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanupAppTests } from './renderApp';
import { server } from './mocks/server';

// jsdom has no viewport; browser tests exercise actual scrolling separately.
vi.stubGlobal('scrollTo', vi.fn());

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(async () => {
  const failures: unknown[] = [];
  for (const release of [cleanupAppTests, cleanup, () => server.resetHandlers()]) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Application test teardown failed');
  }
});
afterAll(() => server.close());
