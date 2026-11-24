/**
 * Client for the free, keyless Open-Meteo APIs: air quality from the CAMS global model (PM2.5,
 * PM10, NO2, O3, SO2, CO), the weather forecast (temperature, wind, humidity, boundary-layer
 * height) and geocoding for city search. Runs unchanged in the browser and in Node 20+ server
 * functions.
 */
import {
  airSchema,
  geocodeSchema,
  weatherSchema,
  type AirFeed,
  type WeatherFeed,
} from './openMeteoSchemas.js';
import type { AirSnapshot, CurrentConditions, HourPoint, Place } from './types.js';

/** Open-Meteo air-quality endpoint (CAMS global model). */
export const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
/** Open-Meteo forecast endpoint, for wind, humidity and boundary-layer height. */
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
/** Open-Meteo geocoding endpoint, for city search. */
export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** The provider failed or sent an unexpected shape. `status` is the HTTP code, if any. */
export class AirDataError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
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

/**
 * Rounds a coordinate to 0.01° (about 1 km), so nearby requests share a cache entry and exact
 * positions never leave the device in full precision.
 */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;

/** Air-quality request: current values plus hourly data for the past day and next four days. */
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

/** Weather request over the same hours as `buildAirUrl`, so the two feeds line up. */
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
  air: AirFeed['hourly'],
  weather: WeatherFeed['hourly'] | null,
): HourPoint[] {
  const wIndex = new Map<string, number>();
  weather?.time.forEach((t, i) => wIndex.set(t, i));
  return air.time.map((time, i) => {
    const w = wIndex.get(time);
    const pick = (arr: (number | null)[] | undefined) =>
      w == null || !arr ? null : (arr[w] ?? null);
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
  for (const [i, h] of hourly.entries()) if (h.time <= currentTime) best = i;
  return best;
}

/** The weather feed, or null when the request failed or sent an unexpected shape. */
function parseWeather(raw: unknown): WeatherFeed | null {
  if (raw == null) return null;
  const parsed = weatherSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Current weather readings; all null (and assumed daytime) when the feed is missing. */
function currentWeather(
  w: WeatherFeed['current'] | null,
): Pick<CurrentConditions, 'temp' | 'rh' | 'wind' | 'windDir' | 'isDay'> {
  if (!w) return { temp: null, rh: null, wind: null, windDir: null, isDay: true };
  return {
    temp: w.temperature_2m,
    rh: w.relative_humidity_2m,
    wind: w.wind_speed_10m,
    windDir: w.wind_direction_10m,
    isDay: w.is_day === 1,
  };
}

/**
 * Live air and weather for a place, merged into one hourly series. Air data is required;
 * weather is optional and its fields are null when that request fails.
 */
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
  const weather = parseWeather(weatherRaw);

  const hourly = mergeHourly(air.data.hourly, weather?.hourly ?? null);
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
      ...currentWeather(weather?.current ?? null),
    },
    hourly,
    nowIndex: findNowIndex(hourly, c.time),
  };
}

/** A city search hit. `region` is the state and country, for telling same-named places apart. */
export interface GeoResult extends Place {
  id: number;
  name: string;
  region: string;
}

/** Up to eight places matching `query`; queries shorter than two characters return none. */
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
