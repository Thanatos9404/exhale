/**
 * Sliding-window rate limiter kept in function memory.
 * Serverless instances do not share memory, so this is a per-instance guard against bursts and
 * scripted abuse of the AI quota, not a global quota. Swap for a shared store (e.g. Redis)
 * if the app needs strict global limits.
 */
import { evictOldest } from './boundedMap.js';

/** Keys tracked per limiter by default: about 1 MB of timestamps at the busiest endpoint's limit. */
const DEFAULT_MAX_KEYS = 5_000;

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
 * tracked; the least recently seen are dropped first, so memory stays bounded.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;

  /** Stores the key as the most recently seen, so eviction reaches it last. */
  function touch(key: string, recent: number[]): void {
    hits.delete(key);
    hits.set(key, recent);
    evictOldest(hits, maxKeys);
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const since = now - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= opts.limit) {
        // A blocked key is touched too. Left in its old position it would be the first evicted
        // under a flood of new keys, and would come back with a fresh quota.
        touch(key, recent);
        const oldest = recent[0] ?? now;
        const retry = Math.ceil((oldest + opts.windowMs - now) / 1000);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retry) };
      }
      recent.push(now);
      touch(key, recent);
      return { ok: true, remaining: opts.limit - recent.length, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}
