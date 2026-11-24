/**
 * Holds a heavy, optional view back until it is worth loading: its placeholder is on screen and
 * the browser has an idle moment.
 */
import { useEffect, useState, type RefObject } from 'react';
import { whenIdle } from './idle';

/**
 * Turns true, and stays true, once the element has been in the viewport through to the next
 * idle period. Scrolling it away before then cancels the wait. Stays false while `enabled` is off.
 */
export function useIdleInView<E extends Element>(
  ref: RefObject<E | null>,
  enabled = true,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || ready || !el) return;
    let cancelIdle: (() => void) | null = null;
    const io = new IntersectionObserver((entries) => {
      if (entries.at(-1)?.isIntersecting) {
        cancelIdle ??= whenIdle(() => setReady(true));
      } else {
        cancelIdle?.();
        cancelIdle = null;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelIdle?.();
    };
  }, [ref, enabled, ready]);

  return ready;
}
