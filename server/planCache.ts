/**
 * A short-lived, bounded cache of validated AI answers, keyed on a hash of the prompt that
 * produced them. Identical prompts (every first-time visitor has the default household and city)
 * then cost one generation per window instead of one per visitor.
 */
import { createHash } from 'node:crypto';
import { evictOldest } from './boundedMap.js';

/**
 * How long an answer is reused. It matches the air-data window (airCache): within it the same
 * household in the same cell produces the same prompt, and after it the readings have moved on.
 */
export const PLAN_CACHE_TTL_MS = 10 * 60_000;

/** Caps instance memory: a validated plan is about 3 kB, so 200 of them stay under 1 MB. */
export const PLAN_CACHE_MAX_ENTRIES = 200;

/** A cache of values keyed by the prompt that produced them. */
export interface PlanCache<T> {
  /** The value stored for exactly this prompt, or null when there is none or it has expired. */
  get(prompt: string, now?: number): T | null;
  /** Stores a value. Callers store validated provider answers only, never failures or fallbacks. */
  set(prompt: string, value: T, now?: number): void;
  /** Number of entries held, expired ones included until they are next read or evicted. */
  size(): number;
  /** Empties the cache (test hook). */
  clear(): void;
}

/**
 * SHA-256 of the prompt. The prompt carries the place, the readings and the whole household, so
 * two households only share a key if their prompts are identical, in which case they are owed
 * the same answer anyway. Hashing keeps the keys small and the prompts out of the map.
 */
function keyOf(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

/** Creates an independent cache; the limits default to the constants above. */
export function createPlanCache<T>(
  ttlMs = PLAN_CACHE_TTL_MS,
  maxEntries = PLAN_CACHE_MAX_ENTRIES,
): PlanCache<T> {
  const entries = new Map<string, { at: number; value: T }>();
  return {
    get(prompt, now = Date.now()) {
      const key = keyOf(prompt);
      const hit = entries.get(key);
      if (!hit) return null;
      if (now - hit.at < ttlMs) return hit.value;
      entries.delete(key);
      return null;
    },
    set(prompt, value, now = Date.now()) {
      const key = keyOf(prompt);
      // Re-insert so a refreshed entry counts as the newest.
      entries.delete(key);
      entries.set(key, { at: now, value });
      evictOldest(entries, maxEntries);
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  };
}
