import { z } from 'zod';

const dateOnlySchema = z.iso.date().refine((date) => date.slice(0, 4) !== '0000');

/** A strict DateOnly closing-price record with a positive finite numeric value. */
export const pricePointSchema = z
  .strictObject({ date: dateOnlySchema, price: z.number().positive() })
  .readonly();

/** Readonly history with strictly increasing, unique dates and no count restriction. */
export const priceSeriesSchema = z
  .array(pricePointSchema)
  .refine((points) =>
    points.every((point, index) => index === 0 || (points[index - 1]?.date ?? '') < point.date),
  )
  .readonly();

/** Unrounded percentage-point statistics; daily sample volatility may be null. */
export const priceStatsSchema = z
  .strictObject({
    totalReturnPercent: z.number(),
    dailyVolatilityPercent: z.number().nullable(),
    maxDrawdownPercent: z.number(),
  })
  .readonly();
