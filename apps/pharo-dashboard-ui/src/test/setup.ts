import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no viewport; browser tests exercise actual scrolling separately.
vi.stubGlobal('scrollTo', vi.fn());
afterEach(cleanup);
