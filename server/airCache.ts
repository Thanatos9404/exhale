import { fetchAirSnapshot, roundCoord } from '../src/lib/air/openMeteo.js';
import type { AirSnapshot, Place } from '../src/lib/air/types.js';

/**
 * Server-side air data. The server fetches readings itself instead of trusting numbers posted
 * by the browser, and caches them for 10 minutes per ~1 km cell (the model updates hourly).
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; data: Promise<AirSnapshot> }>();

export function getAir(
  place: Place,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<AirSnapshot> {
  const key = `${roundCoord(place.lat)},${roundCoord(place.lon)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return hit.data.then((d) => ({ ...d, place: { ...d.place, label: place.label } }));
  }
  const data = fetchAirSnapshot(place, { fetchImpl, signal: AbortSignal.timeout(10_000) });
  cache.set(key, { at: now, data });
  // Never cache failures.
  data.catch(() => cache.delete(key));
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return data;
}

export function clearAirCache(): void {
  cache.clear();
}
