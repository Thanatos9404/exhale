/**
 * Opens and closes a panel by animating its height and opacity as an inline CSS transition, and
 * keeps the panel mounted until it has finished closing.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useLatest } from '@/hooks/useLatest';

const DURATION_MS = 220;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const TRANSITION = `height ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}`;
/** How long after the transition's end the panel is tidied up, in milliseconds. */
const SETTLE_MS = DURATION_MS + 20;

interface Target {
  height?: string;
  opacity: string;
}

/** Transitions from the inline styles already set to `target`. Returns a function that cancels. */
function transitionTo(el: HTMLElement, target: Target, onDone: () => void): () => void {
  // Reading layout commits the starting styles, so the transition has somewhere to start from.
  el.getBoundingClientRect();
  el.style.transition = TRANSITION;
  if (target.height !== undefined) el.style.height = target.height;
  el.style.opacity = target.opacity;
  const timer = setTimeout(onDone, SETTLE_MS);
  return () => clearTimeout(timer);
}

/** Opens from nothing, or from wherever an interrupted close had got to. */
function expand(el: HTMLElement, reduced: boolean): () => void {
  const fresh = el.style.opacity === '';
  const opacity = fresh ? '0' : getComputedStyle(el).opacity;
  const height = fresh ? 0 : el.getBoundingClientRect().height;
  el.style.transition = 'none';
  el.style.opacity = opacity;
  if (reduced) return transitionTo(el, { opacity: '1' }, () => undefined);
  el.style.height = `${height}px`;
  return transitionTo(el, { height: `${el.scrollHeight}px`, opacity: '1' }, () => {
    el.style.height = 'auto';
  });
}

/** Closes from the current size, then reports that the panel can be removed. */
function collapse(el: HTMLElement, reduced: boolean, onClosed: () => void): () => void {
  const opacity = getComputedStyle(el).opacity;
  el.style.transition = 'none';
  el.style.opacity = opacity;
  if (reduced) return transitionTo(el, { opacity: '0' }, onClosed);
  el.style.height = `${el.getBoundingClientRect().height}px`;
  return transitionTo(el, { height: '0px', opacity: '0' }, onClosed);
}

/** What a collapsible panel needs: where to attach, and whether to render at all. */
export interface Collapse<E extends HTMLElement> {
  ref: RefObject<E | null>;
  /** True while the panel is open or still closing. */
  rendered: boolean;
}

/**
 * Animates a panel open and closed. With `reduced` only the opacity fades and the height is
 * never touched. A panel that is open on first render appears without animating.
 */
export function useCollapse<E extends HTMLElement>(open: boolean, reduced: boolean): Collapse<E> {
  const ref = useRef<E>(null);
  const [seen, setSeen] = useState({ open, closing: false });
  if (seen.open !== open) setSeen({ open, closing: !open });
  const animated = useRef(open);
  const reducedNow = useLatest(reduced);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || animated.current === open) return;
    animated.current = open;
    if (open) return expand(el, reducedNow.current);
    return collapse(el, reducedNow.current, () => setSeen({ open: false, closing: false }));
  }, [open, reducedNow]);

  return { ref, rendered: open || seen.closing };
}
