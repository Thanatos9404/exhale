import { evictOldest } from './boundedMap.js';

/**
 * Sliding-window rate limiter kept in function memory.
 * Serverless instances do not share memory, so this is a per-instance guard against bursts and
 * scripted abuse of the Gemini quota, not a global quota. Swap for a shared store (e.g. Redis)
 * if the app needs strict global limits.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the oldest hit leaves the window; sent as the retry-after header. */
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Records a hit for `key` unless it is over the limit. */
  check(key: string, now?: number): RateLimitResult;
  /** Forgets every key (test hook). */
  reset(): void;
}

/**
 * Allows `limit` hits per `windowMs` for each key. At most `maxKeys` (default 5,000) keys are
 * tracked; the oldest are dropped first, so memory stays bounded.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 5_000;

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const since = now - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        const retry = Math.ceil((oldest + opts.windowMs - now) / 1000);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retry) };
      }
      recent.push(now);
      // Re-insert so the key counts as most recently seen.
      hits.delete(key);
      hits.set(key, recent);
      evictOldest(hits, maxKeys);
      return { ok: true, remaining: opts.limit - recent.length, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}
