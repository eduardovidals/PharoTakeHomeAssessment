import { z } from 'zod';

/** Preserve the user's independent search draft; matching never rewrites it. */
export const instrumentSearchSchema = z.strictObject({ search: z.string() });
