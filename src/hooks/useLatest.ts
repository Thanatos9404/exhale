/**
 * The latest-value ref shared by long-lived callbacks. Animation loops and observers subscribe
 * once and read current props through it, instead of tearing down and re-subscribing on every
 * render.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

/** A ref whose `current` is updated to the newest value after every render that changes it. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
