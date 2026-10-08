import { normalizeTicker } from '../instruments';

function canonicalTicker(ticker: string): string {
  const canonical = normalizeTicker(ticker);

  if (canonical === undefined) throw new TypeError('Invalid instrument identifier.');

  return canonical;
}

/**
 * Identify one canonical instrument's price history independently of selection order.
 * @example
 * ```ts
 * pricesKey(' abc '); // ['prices', 'ABC']
 * ```
 */
export function pricesKey(ticker: string): readonly ['prices', string] {
  return ['prices', canonicalTicker(ticker)];
}

/**
 * Identify one canonical instrument's statistics in a distinct resource namespace.
 * @example
 * ```ts
 * priceStatsKey('abc'); // ['price-stats', 'ABC']
 * ```
 */
export function priceStatsKey(ticker: string): readonly ['price-stats', string] {
  return ['price-stats', canonicalTicker(ticker)];
}
