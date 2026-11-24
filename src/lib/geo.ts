/**
 * Where the user is: the browser's geolocation turned into a named place. Coordinates are rounded
 * to about 1 km before anything else sees them, including the BigDataCloud lookup that names the
 * place, and a failed lookup still yields a usable place with a coordinate label.
 */
import { z } from 'zod';
import type { Place } from './air/types';
import { roundCoord } from './air/openMeteo';

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/** The fields we read from BigDataCloud. It sends empty strings for names it does not know. */
const reverseSchema = z.object({
  city: z.string().nullish(),
  locality: z.string().nullish(),
  countryName: z.string().nullish(),
});

/** First name that is present and not empty. */
function firstName(...names: (string | null | undefined)[]): string | undefined {
  for (const name of names) if (name) return name;
  return undefined;
}

/** "City, Country" for rounded coordinates, or a coordinate label if the lookup fails. */
async function describePlace(lat: number, lon: number): Promise<string> {
  const fallback = `Near ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  try {
    const p = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      localityLanguage: 'en',
    });
    const res = await fetch(`${REVERSE_URL}?${p.toString()}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return fallback;
    const parsed = reverseSchema.safeParse(await res.json());
    if (!parsed.success) return fallback;
    const { city, locality, countryName } = parsed.data;
    const name = firstName(city, locality);
    return name ? [name, countryName].filter(Boolean).join(', ') : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Browser geolocation, rounded to ~1 km before it is used anywhere, then named with a
 * keyless reverse-geocoding lookup. Falls back to a coordinate label if naming fails.
 */
export function locateUser(timeoutMs = 10_000): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = roundCoord(pos.coords.latitude);
        const lon = roundCoord(pos.coords.longitude);
        // describePlace never rejects: every failure falls back to the coordinate label.
        void describePlace(lat, lon).then((label) => {
          resolve({ lat, lon, label: label.slice(0, 80) });
        });
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied'
              : 'Could not get your location',
          ),
        ),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}
