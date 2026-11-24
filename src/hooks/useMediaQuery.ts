/**
 * Live media-query hooks built on `matchMedia`, so first-paint code can follow the viewport and
 * the reduced-motion preference without loading an animation library.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { PREFERS_REDUCED_MOTION, mediaQuery } from '@/state/media';

/**
 * Whether `query` matches, re-rendering the caller when the answer changes. `fallback` is the
 * answer where the browser cannot evaluate media queries at all.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQuery(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => mediaQuery(query)?.matches ?? fallback);
}

/** True while the OS asks for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(PREFERS_REDUCED_MOTION);
}
