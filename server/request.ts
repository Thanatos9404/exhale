/**
 * What every POST handler does before its own work: refuse cross-site callers, apply the
 * per-client rate limit, and fetch live air data inside the request deadline.
 */
import type { AirSnapshot, Place } from '../src/lib/air/types.js';
import { getAir } from './airCache.js';
import { within, type Deadline } from './deadline.js';
import { HttpError, clientKey } from './http.js';
import { assertSameOrigin } from './origin.js';
import type { RateLimitResult, RateLimiter } from './rateLimit.js';

/**
 * Longest a handler waits for air data. The fetch stops itself at 10 s (airCache); one second on
 * top lets its own error arrive first, so this only decides when a fetch fails to stop.
 */
const AIR_WAIT_MS = 11_000;

/** Throws 429 with a retry-after header when `key` is over the limiter's quota. */
export function enforceLimit(limiter: RateLimiter, key: string, message: string): RateLimitResult {
  const result = limiter.check(key);
  if (!result.ok)
    throw new HttpError(429, message, { 'retry-after': String(result.retryAfterSec) });
  return result;
}

/**
 * The gate in front of every state-changing handler: 403 for a cross-site request, then 429 when
 * the client is over its quota. Runs before the body is read, so a refused request costs nothing.
 */
export function admit(
  request: Request,
  limiter: RateLimiter,
  busyMessage: string,
): RateLimitResult {
  assertSameOrigin(request);
  return enforceLimit(limiter, clientKey(request), busyMessage);
}

/** Live air data for the place, or a 502 the client can show when the provider fails or stalls. */
export async function liveAir(place: Place, deadline: Deadline): Promise<AirSnapshot> {
  try {
    return await within(getAir(place), deadline.budget(AIR_WAIT_MS));
  } catch {
    throw new HttpError(502, 'Air data provider is unavailable');
  }
}
