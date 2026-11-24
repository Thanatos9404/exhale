/**
 * Decides when optional code may load: a wait for browser idle time, and the check for users
 * who asked their browser to save data.
 */
import { mediaMatches } from '@/state/media';

/** Longest wait for an idle period before the work runs anyway, in milliseconds. */
const IDLE_TIMEOUT_MS = 2000;
/** Delay used where the browser has no `requestIdleCallback`, in milliseconds. */
const FALLBACK_DELAY_MS = 200;

/** Media query for the data-saver preference. */
const PREFERS_REDUCED_DATA = '(prefers-reduced-data: reduce)';

/** Runs `work` once the browser is idle. Returns a function that cancels it. */
export function whenIdle(work: () => void, timeout = IDLE_TIMEOUT_MS): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(work, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(work, FALLBACK_DELAY_MS);
  return () => clearTimeout(id);
}

/** True when the browser's data saver is on or the user prefers reduced data. */
export function prefersReducedData(): boolean {
  const connection: unknown = 'connection' in navigator ? navigator.connection : null;
  const saveData =
    typeof connection === 'object' &&
    connection !== null &&
    'saveData' in connection &&
    connection.saveData === true;
  return saveData || mediaMatches(PREFERS_REDUCED_DATA);
}
