import { setupServer } from 'msw/node';

// Importing this test-only helper does not listen; setup.ts owns its lifecycle.
export const server = setupServer();
