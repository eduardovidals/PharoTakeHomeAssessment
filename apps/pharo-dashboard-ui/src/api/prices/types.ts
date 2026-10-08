import type { z } from 'zod';
import type { pricePointSchema, priceSeriesSchema, priceStatsSchema } from './schema';

/** Readonly date-only price with the validated unrounded numeric value. */
export type PricePoint = z.infer<typeof pricePointSchema>;

/** Readonly strictly chronological price observations. */
export type PriceSeries = z.infer<typeof priceSeriesSchema>;

/** Percentage-point statistics with explicit insufficient-data volatility. */
export type PriceStats = z.infer<typeof priceStatsSchema>;
