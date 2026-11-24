/**
 * Server-side air data. The server fetches readings itself instead of trusting numbers posted
 * by the browser, and caches them per ~1 km cell: ten minutes for a reading, half a minute for
 * a provider failure.
 */
import { fetchAirSnapshot, roundCoord } from '../src/lib/air/openMeteo.js';
import type { AirSnapshot, Place } from '../src/lib/air/types.js';
import { evictOldest } from './boundedMap.js';

/** The forecast model updates hourly, so ten minutes of reuse loses nothing. */
const TTL_MS = 10 * 60_000;

/** Caps instance memory; each entry is one ~1 km cell. */
const MAX_ENTRIES = 500;

/** The upstream provider gets 10 s, leaving most of the request deadline for the AI step. */
export const FETCH_TIMEOUT_MS = 10_000;

/**
 * A failed fetch is remembered for 30 s. During an outage the requests that follow fail at once
 * instead of each holding a function for the full timeout; 30 s later the provider is asked again,
 * so recovery is quick and an old failure is never served.
 */
const FAILURE_TTL_MS = 30_000;

interface Entry {
  /** When the fetch started. */
  at: number;
  data: Promise<AirSnapshot>;
  /** Set when the fetch failed; the entry then lives for FAILURE_TTL_MS only. */
  failedAt?: number;
}

const cache = new Map<string, Entry>();

/** A reading is fresh for ten minutes from its fetch; a failure for 30 s from the moment it failed. */
function isFresh(entry: Entry, now: number): boolean {
  if (entry.failedAt !== undefined) return now - entry.failedAt < FAILURE_TTL_MS;
  return now - entry.at < TTL_MS;
}

/**
 * Live air data for a place, shared by every request in the same ~1 km cell for 10 minutes.
 * Concurrent requests share one in-flight fetch. A failure rejects every request for the cell
 * for the next 30 s without asking the provider again, and is never served after that.
 */
export function getAir(
  place: Place,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<AirSnapshot> {
  const key = `${roundCoord(place.lat)},${roundCoord(place.lon)}`;
  const hit = cache.get(key);
  if (hit && isFresh(hit, now)) {
    return hit.data.then((d) => ({ ...d, place: { ...d.place, label: place.label } }));
  }
  const started = Date.now();
  const data = fetchAirSnapshot(place, {
    fetchImpl,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const entry: Entry = { at: now, data };
  // Re-insert so a refreshed cell counts as the newest entry.
  cache.delete(key);
  cache.set(key, entry);
  data.catch(() => {
    // `now` may be a test clock, so the failure time is the start plus the time the fetch took.
    entry.failedAt = now + (Date.now() - started);
  });
  evictOldest(cache, MAX_ENTRIES);
  return data;
}

/** Empties the cache (test hook). */
export function clearAirCache(): void {
  cache.clear();
}
