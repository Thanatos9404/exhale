/**
 * Theme-aware helpers for canvas and WebGL visuals: resolved CSS colours, a subscription to
 * theme flips, on-screen detection for pausing loops, and the WebGL capability check.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

const FALLBACK_COLOR = '#888';

/** Calls `onChange` whenever the root `data-theme` attribute flips. */
export function subscribeToTheme(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

const readTheme = () => document.documentElement.getAttribute('data-theme');

/** True once every requested name has a value, which narrows the partial record to a full one. */
function hasEvery<T extends string>(
  record: Partial<Record<T, string>>,
  names: readonly T[],
): record is Record<T, string> {
  return names.every((n) => typeof record[n] === 'string');
}

function readCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const style = getComputedStyle(document.documentElement);
  const colors: Partial<Record<T, string>> = {};
  for (const n of names) colors[n] = style.getPropertyValue(`--${n}`).trim() || FALLBACK_COLOR;
  if (!hasEvery(colors, names)) throw new Error('Expected a colour for every CSS variable');
  return colors;
}

/**
 * Resolves CSS custom properties to concrete colours. The theme attribute is the external
 * store: a flip re-renders the caller, and every render reads the current values for the
 * names it asks for.
 */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  useSyncExternalStore(subscribeToTheme, readTheme);
  return readCssVars(names);
}

/** True while the element is on screen and the tab is visible: used to pause animation loops. */
export function useInView<E extends Element>(ref: React.RefObject<E | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setInView(onScreen && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      onScreen = Boolean(e?.isIntersecting);
      update();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);
  return inView;
}

/** Whether this browser can create a WebGL (2 or 1) context for the 3D views. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
