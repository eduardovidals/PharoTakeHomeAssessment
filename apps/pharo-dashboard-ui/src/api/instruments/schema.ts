import { z } from 'zod';

/** Canonical ASCII ticker bytes returned by the backend, without transformation. */
export const canonicalTickerSchema = z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,31}$/);

/** Sorted, unique canonical instruments; dataset size is deliberately unrestricted. */
export const instrumentsSchema = z
  .array(canonicalTickerSchema)
  .refine((items) => items.every((item, index) => index === 0 || (items[index - 1] ?? '') < item))
  .readonly();

/**
 * Normalize a caller's string identifier; reject other types and invalid symbols.
 * @example
 * ```ts
 * normalizeTicker(' abc.1 '); // 'ABC.1'
 * ```
 */
export function normalizeTicker(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  // ASCII validation precedes casing: Unicode expansion must not invent a ticker.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(trimmed)) return undefined;

  return trimmed.toUpperCase();
}
