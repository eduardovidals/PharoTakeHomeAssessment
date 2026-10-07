import type { z } from 'zod';
import type { instrumentsSchema } from './schema';

/** Readonly sorted canonical instrument IDs validated at the HTTP boundary. */
export type Instruments = z.infer<typeof instrumentsSchema>;
