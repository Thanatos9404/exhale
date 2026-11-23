import { z } from 'zod';
import type { AirSnapshot, HourPoint, Place } from './types.js';

/**
 * Client for the free, keyless Open-Meteo APIs:
 *  - Air quality (CAMS global model): PM2.5, PM10, NO2, O3, SO2, CO
 *  - Weather forecast: temperature, wind, humidity and boundary-layer height
 *  - Geocoding: city search
 * Runs unchanged in the browser and in Node 20+ server functions.
 */

export const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const nums = z.array(z.number().nullable());

const airSchema = z.object({
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
    time: z.array(z.string()),
    pm2_5: nums,
    pm10: nums,
    nitrogen_dioxide: nums,
    ozone: nums,
  }),
});

const weatherSchema = z.object({
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

const geocodeSchema = z.object({
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

export class AirDataError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AirDataError';
  }
}

type Fetch = typeof fetch;

async function getJson(url: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchImpl(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new AirDataError(`Data provider responded ${res.status}`, res.status);
  return res.json();
}

/** Round to ~1 km so nearby requests share a cache entry and exact positions never leave the device in full precision. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;

export function buildAirUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    current: 'pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide',
    hourly: 'pm2_5,pm10,nitrogen_dioxide,ozone',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '4',
  });
  return `${AIR_URL}?${p.toString()}`;
}

export function buildWeatherUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'temperature_2m,wind_speed_10m,boundary_layer_height,relative_humidity_2m',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '4',
  });
  return `${WEATHER_URL}?${p.toString()}`;
}

/** Merge the two hourly feeds on their shared local timestamps. Exported for tests. */
export function mergeHourly(
  air: z.infer<typeof airSchema>['hourly'],
  weather: z.infer<typeof weatherSchema>['hourly'] | null,
): HourPoint[] {
  const wIndex = new Map<string, number>();
  weather?.time.forEach((t, i) => wIndex.set(t, i));
  return air.time.map((time, i) => {
    const w = wIndex.get(time);
    const pick = (arr: (number | null)[] | undefined) => (w == null || !arr ? null : (arr[w] ?? null));
    return {
      time,
      pm25: air.pm2_5[i] ?? null,
      pm10: air.pm10[i] ?? null,
      no2: air.nitrogen_dioxide[i] ?? null,
      o3: air.ozone[i] ?? null,
      temp: pick(weather?.temperature_2m),
      wind: pick(weather?.wind_speed_10m),
      blh: pick(weather?.boundary_layer_height),
      rh: pick(weather?.relative_humidity_2m),
    };
  });
}

/** Index of the hour containing `currentTime` ("YYYY-MM-DDTHH:mm"), or the closest earlier hour. */
export function findNowIndex(hourly: readonly HourPoint[], currentTime: string): number {
  const hourKey = `${currentTime.slice(0, 13)}:00`;
  const exact = hourly.findIndex((h) => h.time === hourKey);
  if (exact >= 0) return exact;
  let best = 0;
  for (let i = 0; i < hourly.length; i++) if (hourly[i]!.time <= currentTime) best = i;
  return best;
}

export async function fetchAirSnapshot(
  place: Place,
  opts: { fetchImpl?: Fetch; signal?: AbortSignal } = {},
): Promise<AirSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [airRaw, weatherRaw] = await Promise.all([
    getJson(buildAirUrl(place.lat, place.lon), fetchImpl, opts.signal),
    // Weather enriches the story (inversion, wind) but the app still works without it.
    getJson(buildWeatherUrl(place.lat, place.lon), fetchImpl, opts.signal).catch(() => null),
  ]);
  const air = airSchema.safeParse(airRaw);
  if (!air.success) throw new AirDataError('Unexpected air-quality response');
  const weather = weatherRaw == null ? null : weatherSchema.safeParse(weatherRaw);
  const w = weather?.success ? weather.data : null;

  const hourly = mergeHourly(air.data.hourly, w?.hourly ?? null);
  const c = air.data.current;
  return {
    place: { ...place, timezone: air.data.timezone },
    fetchedAt: new Date().toISOString(),
    utcOffsetSeconds: air.data.utc_offset_seconds,
    current: {
      time: c.time,
      pm25: c.pm2_5,
      pm10: c.pm10,
      no2: c.nitrogen_dioxide,
      o3: c.ozone,
      so2: c.sulphur_dioxide,
      co: c.carbon_monoxide,
      temp: w?.current.temperature_2m ?? null,
      rh: w?.current.relative_humidity_2m ?? null,
      wind: w?.current.wind_speed_10m ?? null,
      windDir: w?.current.wind_direction_10m ?? null,
      isDay: w ? w.current.is_day === 1 : true,
    },
    hourly,
    nowIndex: findNowIndex(hourly, c.time),
  };
}

export interface GeoResult extends Place {
  id: number;
  name: string;
  region: string;
}

export async function searchPlaces(
  query: string,
  opts: { fetchImpl?: Fetch; signal?: AbortSignal } = {},
): Promise<GeoResult[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const p = new URLSearchParams({ name: q, count: '8', language: 'en', format: 'json' });
  const raw = await getJson(`${GEOCODE_URL}?${p.toString()}`, opts.fetchImpl ?? fetch, opts.signal);
  const parsed = geocodeSchema.safeParse(raw);
  if (!parsed.success) throw new AirDataError('Unexpected geocoding response');
  return (parsed.data.results ?? []).map((r) => {
    const region = [r.admin1, r.country].filter(Boolean).join(', ');
    return {
      id: r.id,
      name: r.name,
      region,
      lat: r.latitude,
      lon: r.longitude,
      label: [r.name, r.country].filter(Boolean).join(', '),
      ...(r.timezone ? { timezone: r.timezone } : {}),
    };
  });
}
