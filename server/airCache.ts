import { fetchAirSnapshot, roundCoord } from '../src/lib/air/openMeteo.js';
import type { AirSnapshot, Place } from '../src/lib/air/types.js';
import { evictOldest } from './boundedMap.js';

/**
 * Server-side air data. The server fetches readings itself instead of trusting numbers posted
 * by the browser, and caches them for 10 minutes per ~1 km cell (the model updates hourly).
 */
const TTL_MS = 10 * 60_000;
/** Caps instance memory; each entry is one ~1 km cell. */
const MAX_ENTRIES = 500;
/** The upstream provider gets 10 s, leaving most of the function budget for the AI step. */
const FETCH_TIMEOUT_MS = 10_000;
const cache = new Map<string, { at: number; data: Promise<AirSnapshot> }>();

/**
 * Live air data for a place, shared by every request in the same ~1 km cell for 10 minutes.
 * Concurrent requests share one in-flight fetch; failures are never cached.
 */
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
  const data = fetchAirSnapshot(place, {
    fetchImpl,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  cache.set(key, { at: now, data });
  // Never cache failures.
  data.catch(() => cache.delete(key));
  evictOldest(cache, MAX_ENTRIES);
  return data;
}

/** Empties the cache (test hook). */
export function clearAirCache(): void {
  cache.clear();
}
