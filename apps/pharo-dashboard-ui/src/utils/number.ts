type NumericValue = number | null | undefined;

const fixed = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signed = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const axis = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 17 });

function displayValue(value: NumericValue): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  return Math.abs(value) < 0.005 ? 0 : value;
}

/** Group supplied price units with two decimals; never introduce currency. */
export function formatPrice(value: NumericValue): string {
  const display = displayValue(value);
  return display === null ? 'Unavailable' : fixed.format(display);
}

/** Magnitude-aware axis precision without rounding the source observation. */
export function formatPriceAxis(value: NumericValue): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? axis.format(Object.is(value, -0) ? 0 : value)
    : 'Unavailable';
}

/** Already-scaled percentage points retain their API units and supplied sign. */
export function formatPercentage(value: NumericValue): string {
  const display = displayValue(value);
  return display === null ? 'Unavailable' : `${fixed.format(display)}%`;
}

/** Return percentages show a positive sign, except when display rounding yields zero. */
export function formatSignedPercentage(value: NumericValue): string {
  const display = displayValue(value);
  return display === null ? 'Unavailable' : `${signed.format(display)}%`;
}
