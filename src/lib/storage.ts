/**
 * Defensive localStorage access. Storage can be missing, full or blocked (private mode),
 * and stored values can be stale or tampered with, so every read is validated.
 */
export function readStored<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the app still works for this session */
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  household: 'exhale.household.v1',
  place: 'exhale.place.v1',
  theme: 'exhale.theme',
  deployments: 'exhale.deployments.v1',
  chat: 'exhale.chat.v1',
  done: 'exhale.done.v1',
} as const;
