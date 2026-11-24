/**
 * Bounded in-memory maps: the one eviction rule shared by every cache and limiter on the server,
 * so a flood of distinct keys cannot exhaust instance memory.
 */

/** Deletes the oldest entries (a Map iterates in insertion order) until at most `maxSize` remain. */
export function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  for (const key of map.keys()) {
    if (map.size <= maxSize) return;
    map.delete(key);
  }
}
