import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a ref pointed at the latest value, so long-lived callbacks such as animation loops and
 * observers read current props without tearing down and re-subscribing on every render.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
