/**
 * Shapes of the Open-Meteo responses the app reads. Every feed is parsed with these before use,
 * so a provider change shows up as one clear error instead of undefined values downstream.
 */
import { z } from 'zod';

/** A column of hourly values; the provider sends null where it has no reading. */
const nums = z.array(z.number().nullable());

/** Air-quality feed: current readings and the hourly series, µg/m³. */
export const airSchema = z.object({
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    pm2_5: z.number().nullable(),
    pm10: z.number().nullable(),
    nitrogen_dioxide: z.number().nullable(),
    ozone: z.number().nullable(),
    sulphur_dioxide: z.number().nullable(),
    carbon_monoxide: z.number().nullable(),
  }),
  hourly: z.object({
    // A feed without a single hour cannot be planned from; it is treated as a provider error.
    time: z.array(z.string()).min(1),
    pm2_5: nums,
    pm10: nums,
    nitrogen_dioxide: nums,
    ozone: nums,
  }),
});

/** Forecast feed: current weather and the hourly series. */
export const weatherSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number().nullable(),
    relative_humidity_2m: z.number().nullable(),
    wind_speed_10m: z.number().nullable(),
    wind_direction_10m: z.number().nullable(),
    is_day: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: nums,
    wind_speed_10m: nums,
    boundary_layer_height: nums,
    relative_humidity_2m: nums,
  }),
});

/** City search results; `results` is absent when nothing matches. */
export const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
        population: z.number().optional(),
      }),
    )
    .optional(),
});

/** A parsed air-quality response. */
export type AirFeed = z.infer<typeof airSchema>;
/** A parsed forecast response. */
export type WeatherFeed = z.infer<typeof weatherSchema>;
