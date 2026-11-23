/**
 * Media-query helpers that degrade gracefully where `window.matchMedia` is missing
 * (older embedded browsers and some test environments).
 */

/** Media query for an OS-level dark colour scheme. */
export const PREFERS_DARK = '(prefers-color-scheme: dark)';

/** Media query for the OS reduced-motion setting. */
export const PREFERS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The live media query list for `query`, or null where the browser cannot evaluate it. */
export function mediaQuery(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Whether `query` matches right now; false where the browser cannot evaluate it. */
export function mediaMatches(query: string): boolean {
  return mediaQuery(query)?.matches ?? false;
}
