/**
 * Deletes the oldest entries (a Map iterates in insertion order) until at most `maxSize` remain.
 * The in-memory caches and limiters use it so a flood of distinct keys cannot exhaust memory.
 */
export function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  for (const key of map.keys()) {
    if (map.size <= maxSize) return;
    map.delete(key);
  }
}
