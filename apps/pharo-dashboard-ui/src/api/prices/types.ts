import type { z } from 'zod';
import type { priceSeriesSchema, priceStatsSchema } from './schema';

/** Readonly strictly chronological price observations. */
export type PriceSeries = z.infer<typeof priceSeriesSchema>;

/** Percentage-point statistics with explicit insufficient-data volatility. */
export type PriceStats = z.infer<typeof priceStatsSchema>;
