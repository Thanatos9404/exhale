/**
 * Sliding-window rate limiter kept in function memory.
 * Serverless instances do not share memory, so this is a per-instance guard against bursts and
 * scripted abuse of the Gemini quota, not a global quota. Swap for a shared store (e.g. Redis)
 * if the app needs strict global limits.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 5_000;

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const since = now - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        const retry = Math.ceil((recent[0]! + opts.windowMs - now) / 1000);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retry) };
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      // Evict the oldest keys so memory stays bounded.
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
      return { ok: true, remaining: opts.limit - recent.length, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}
